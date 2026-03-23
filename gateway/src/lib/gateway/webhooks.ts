/**
 * Webhook ingress — Layer 2–3 (Gateway Core / API)
 *
 * Validates HMAC signatures, renders prompt templates, creates Cognition
 * sessions, and persists unified DispatchRun records.
 *
 * This module is server-only. It must not import React or any Next.js page/component module.
 */

import { createHmac, timingSafeEqual } from "crypto";
import {
  buildDispatchCallbackUrl,
  createDispatchRun,
  createCognitionSession,
  clearContextMapping,
  executeDispatch,
  executeDispatchInSession,
  enqueueDispatch,
  enqueueDispatchInSession,
  findContextMapping,
  generateCallbackToken,
  markDispatchRunError,
  markDispatchRunSuccess,
  reserveContextMapping,
  type DispatchContext,
  upsertContextMapping,
} from "./dispatch";

/**
 * Render a prompt template by replacing {{body}} with the JSON-encoded
 * request body and any top-level string fields as {{field}}.
 */
export function renderPromptTemplate(
  template: string,
  body: unknown,
): string {
  let result = template.replace("{{body}}", JSON.stringify(body, null, 2));

  // Replace any {{key}} where key is a top-level string field of the body
  if (typeof body === "object" && body !== null) {
    const record = body as Record<string, unknown>;
    for (const [key, value] of Object.entries(record)) {
      if (typeof value === "string") {
        result = result.replaceAll(`{{${key}}}`, value);
      }
    }
  }

  return result;
}

function extractContextKey(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) {
    return undefined;
  }

  const record = body as Record<string, unknown>;
  const repository = record.repository;
  const pullRequest = record.pull_request;
  const issue = record.issue;

  if (typeof repository === "object" && repository !== null) {
    const repo = repository as Record<string, unknown>;
    const repoName =
      typeof repo.full_name === "string"
        ? repo.full_name
        : typeof repo.name === "string"
          ? repo.name
          : undefined;

    if (repoName && typeof pullRequest === "object" && pullRequest !== null) {
      const pr = pullRequest as Record<string, unknown>;
      if (typeof pr.number === "number") {
        return `${repoName}:pull_request:${pr.number}`;
      }
    }

    if (repoName && typeof issue === "object" && issue !== null) {
      const issueRecord = issue as Record<string, unknown>;
      if (typeof issueRecord.number === "number") {
        return `${repoName}:issue:${issueRecord.number}`;
      }
    }
  }

  if (typeof record.contextKey === "string" && record.contextKey.trim()) {
    return record.contextKey.trim();
  }

  return undefined;
}

/**
 * Validate an HMAC-SHA256 signature from the `X-Hub-Signature-256` header.
 * Returns true if the signature matches or if no secret is configured.
 */
export function validateSignature(
  secret: string,
  payload: string,
  signatureHeader: string | null,
): boolean {
  if (!signatureHeader) return false;

  const expected = `sha256=${createHmac("sha256", secret)
    .update(payload)
    .digest("hex")}`;

  try {
    return timingSafeEqual(
      Buffer.from(expected, "utf8"),
      Buffer.from(signatureHeader, "utf8"),
    );
  } catch {
    return false;
  }
}

/**
 * Process an inbound webhook invocation.
 *
 * @param path - the webhook path segment (e.g. "my-webhook")
 * @param body - parsed JSON body from the request
 * @param rawBody - raw string body for HMAC validation
 * @param signatureHeader - value of `X-Hub-Signature-256` header
 * @param sourceIp - client IP address for audit
 * @param ctx - runtime context (db, serverUrl, broadcast)
 * @returns { status: 202 | 400 | 401 | 404 } and optional error message
 */
export async function handleWebhookInvocation(
  path: string,
  body: unknown,
  rawBody: string,
  signatureHeader: string | null,
  sourceIp: string | null,
  ctx: DispatchContext,
): Promise<{ httpStatus: number; message: string }> {
  const { db, serverUrl, broadcast } = ctx;

  const webhook = await db.webhook.findUnique({ where: { path } });
  if (!webhook) {
    return { httpStatus: 404, message: "Webhook not found" };
  }
  if (!webhook.enabled) {
    return { httpStatus: 404, message: "Webhook not found" };
  }

  // HMAC validation if secret is set
  if (webhook.secret) {
    if (!validateSignature(webhook.secret, rawBody, signatureHeader)) {
      return { httpStatus: 401, message: "Invalid signature" };
    }
  }

  const dispatchRun = await createDispatchRun(db, {
    callbackToken: generateCallbackToken(),
    sourceType: "webhook",
    sourceId: webhook.id,
    status: "running",
      metadata: {
        webhookName: webhook.name,
        title: `Webhook: ${webhook.name}`,
        agentName: webhook.agentName,
        sessionMode: webhook.sessionMode,
        approvalMode: webhook.approvalMode,
        sourceIp,
        scopeUserId: ctx.scopeUserId,
      },
      webhookId: webhook.id,
  });

  broadcast({
    type: "webhook.invoked",
    webhookId: webhook.id,
    webhookName: webhook.name,
    invocationId: dispatchRun.id,
  });

  // Run asynchronously — don't block the HTTP response
  void processWebhookInBackground(webhook, dispatchRun.id, body, ctx);

  return { httpStatus: 202, message: "Accepted" };
}

async function processWebhookInBackground(
  webhook: { id: string; name: string; agentName: string; promptTemplate: string; sessionMode: string; approvalMode: string },
  dispatchRunId: string,
  body: unknown,
  ctx: DispatchContext,
): Promise<void> {
  const { db, serverUrl, broadcast } = ctx;
  let sessionId: string | undefined;
  const contextKey = webhook.sessionMode === "persistent" ? extractContextKey(body) : undefined;
  const existingMapping = await findContextMapping(db, contextKey);

  try {
    const callbackBaseUrl = process.env.GATEWAY_PUBLIC_URL ?? process.env.AUTH_URL ?? "http://localhost:3002";
    const runRecord = await db.dispatchRun.findUnique({
      where: { id: dispatchRunId },
      select: { callbackToken: true },
    });
    const callbackUrl = runRecord?.callbackToken
      ? buildDispatchCallbackUrl(callbackBaseUrl, runRecord.callbackToken)
      : undefined;

    await db.dispatchRun.update({
      where: { id: dispatchRunId },
      data: { callbackUrl: callbackUrl ?? null },
    });

    const prompt = renderPromptTemplate(webhook.promptTemplate, body);
    const approvalRequired = webhook.approvalMode === "always";
    await db.dispatchRun.update({
      where: { id: dispatchRunId },
      data: {
        renderedPrompt: prompt,
        contextKey,
        status: approvalRequired ? "awaiting_approval" : "running",
        approvalRequired,
        approvalReason: approvalRequired ? "Webhook requires approval before execution" : null,
      },
    });

    if (approvalRequired) {
      broadcast({
        type: "dispatch.approval_required",
        runId: dispatchRunId,
        sourceType: "webhook",
        sourceId: webhook.id,
        reason: "Webhook requires approval before execution",
      });
      return;
    }

    if (!existingMapping && contextKey) {
      sessionId = await createCognitionSession(serverUrl, {
        title: `Webhook: ${webhook.name}`,
        agentName: webhook.agentName,
        scopeUserId: ctx.scopeUserId,
      });

      await reserveContextMapping(db, {
        key: contextKey,
        sourceType: "webhook",
        sourceId: webhook.id,
        sessionId,
        metadata: {
          webhookName: webhook.name,
        },
      });
    }

    const dispatchResult = sessionId || existingMapping?.sessionId
      ? callbackUrl
        ? await enqueueDispatchInSession(serverUrl, {
            sessionId: sessionId ?? existingMapping?.sessionId ?? "",
            content: prompt,
            scopeUserId: ctx.scopeUserId,
            callbackUrl,
          })
        : await executeDispatchInSession(serverUrl, {
            sessionId: sessionId ?? existingMapping?.sessionId ?? "",
            content: prompt,
            scopeUserId: ctx.scopeUserId,
            callbackUrl,
          })
      : callbackUrl
        ? await enqueueDispatch(
            serverUrl,
            {
              title: `Webhook: ${webhook.name}`,
              agentName: webhook.agentName,
              scopeUserId: ctx.scopeUserId,
              callbackUrl,
            },
            prompt,
          )
        : await executeDispatch(
            serverUrl,
            {
              title: `Webhook: ${webhook.name}`,
              agentName: webhook.agentName,
              scopeUserId: ctx.scopeUserId,
              callbackUrl,
            },
            prompt,
          );
    sessionId = dispatchResult.sessionId;

    if (contextKey) {
      await upsertContextMapping(db, {
        key: contextKey,
        sourceType: "webhook",
        sourceId: webhook.id,
        sessionId,
        metadata: {
          webhookName: webhook.name,
        },
      });
    }

    broadcast({
      type: "webhook.invoked",
      webhookId: webhook.id,
      webhookName: webhook.name,
      invocationId: dispatchRunId,
      status: callbackUrl ? "running" : "success",
      sessionId,
      ...(callbackUrl ? { callbackUrl } : {}),
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[webhooks] Invocation ${dispatchRunId} failed:`, error);

    if (contextKey && !existingMapping?.sessionId && sessionId) {
      await clearContextMapping(db, contextKey);
    }

    if (dispatchRunId) {
      await markDispatchRunError(db, dispatchRunId, {
        sessionId,
        error,
      });
    }

    broadcast({
      type: "webhook.invoked",
      webhookId: webhook.id,
      webhookName: webhook.name,
      invocationId: dispatchRunId,
      status: "error",
      sessionId,
      error,
    });
  }
}
