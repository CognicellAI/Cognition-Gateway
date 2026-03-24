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
  findSessionIdByMetadata,
  generateCallbackToken,
  markDispatchRunError,
  markDispatchRunRunning,
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

function getNestedValue(body: unknown, path: string): unknown {
  if (!path) return undefined;
  const parts = path.split(".");
  let current: unknown = body;
  for (const part of parts) {
    if (typeof current !== "object" || current === null) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function renderDispatchRuleTemplate(template: string, body: unknown): string {
  return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, rawPath: string) => {
    const path = rawPath.trim();
    if (path === "body") {
      return JSON.stringify(body, null, 2);
    }

    const value = getNestedValue(body, path);
    if (value === undefined || value === null) {
      return "";
    }
    return typeof value === "string" ? value : JSON.stringify(value);
  });
}

interface NormalizedIntegrationEvent {
  integrationType: "github";
  eventType: string;
  action: string | null;
  body: unknown;
}

function extractGitHubEventFromBody(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) {
    return undefined;
  }

  const record = body as Record<string, unknown>;
  const issue = record.issue;
  const pullRequest = record.pull_request;
  const review = record.review;
  const comment = record.comment;

  if (typeof pullRequest === "object" && pullRequest !== null) {
    return "pull_request";
  }

  if (typeof review === "object" && review !== null) {
    return "pull_request_review";
  }

  if (typeof comment === "object" && comment !== null) {
    const hasPullRequest =
      typeof issue === "object" &&
      issue !== null &&
      typeof (issue as Record<string, unknown>).pull_request === "object";
    return hasPullRequest ? "pull_request_review_comment" : "issue_comment";
  }

  if (typeof issue === "object" && issue !== null) {
    const issueRecord = issue as Record<string, unknown>;
    const hasPullRequest = typeof issueRecord.pull_request === "object" && issueRecord.pull_request !== null;
    return hasPullRequest ? "pull_request" : "issues";
  }

  return undefined;
}

function normalizeGitHubEvent(
  body: unknown,
  eventHeader: string | null,
): NormalizedIntegrationEvent | null {
  const normalizedHeader = eventHeader?.trim().toLowerCase() || null;
  const bodyEventType = extractGitHubEventFromBody(body);
  const eventType = normalizedHeader || bodyEventType;
  if (!eventType) {
    return null;
  }

  const action =
    typeof body === "object" && body !== null && typeof (body as Record<string, unknown>).action === "string"
      ? ((body as Record<string, unknown>).action as string)
      : null;

  return {
    integrationType: "github",
    eventType,
    action,
    body,
  };
}

function getWebhookUserId(webhook: unknown): string {
  const candidate = (webhook as { userId?: unknown }).userId;
  if (typeof candidate !== "string" || candidate.trim().length === 0) {
    throw new Error("Webhook is missing user ownership metadata");
  }

  return candidate;
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

function matchesDispatchRule(
  rule: { eventType: string; actionFilter: string | null },
  event: NormalizedIntegrationEvent,
): boolean {
  const normalizedRuleEventType = rule.eventType.trim().toLowerCase();
  const normalizedEventType = event.eventType.trim().toLowerCase();

  if (!normalizedRuleEventType || normalizedEventType !== normalizedRuleEventType) {
    return false;
  }

  if (rule.actionFilter === null) {
    return true;
  }

  const normalizedRuleAction = rule.actionFilter.trim().toLowerCase();
  if (!normalizedRuleAction || event.action === null) {
    return false;
  }

  return event.action.trim().toLowerCase() === normalizedRuleAction;
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
  eventHeader: string | null,
  sourceIp: string | null,
  ctx: DispatchContext,
): Promise<{ httpStatus: number; message: string }> {
  console.log(`[webhooks] Handling webhook invocation for path: ${path}`);
  const { db, serverUrl, broadcast } = ctx;

  const webhook = await db.webhook.findUnique({ where: { path } });
  if (!webhook) {
    console.error(`[webhooks] Webhook not found for path: ${path}`);
    return { httpStatus: 404, message: "Webhook not found" };
  }
  if (!webhook.enabled) {
    return { httpStatus: 404, message: "Webhook not found" };
  }

  const normalizedEvent = webhook.integrationType === "github"
    ? normalizeGitHubEvent(body, eventHeader)
    : null;

  const matchedRule = normalizedEvent
    ? await db.dispatchRule.findMany({
        where: {
          integrationType: normalizedEvent.integrationType,
          enabled: true,
          eventType: normalizedEvent.eventType,
        },
        orderBy: { createdAt: "asc" },
      }).then((rules) => rules.find((rule) => matchesDispatchRule(rule, normalizedEvent)) ?? null)
    : null;

  if (webhook.integrationType && !matchedRule) {
    const dispatchRun = await createDispatchRun(db, {
      sourceType: "webhook",
      sourceId: webhook.id,
      status: "error",
      metadata: {
        webhookName: webhook.name,
        integrationType: webhook.integrationType,
        eventType: normalizedEvent?.eventType ?? eventHeader ?? null,
        action: normalizedEvent?.action ?? null,
        unmatched: true,
      },
      webhookId: webhook.id,
    });

    await markDispatchRunError(db, dispatchRun.id, {
      error: `No matching dispatch rule for integration '${webhook.integrationType}' event '${normalizedEvent?.eventType ?? eventHeader ?? "unknown"}'${normalizedEvent?.action ? ` action '${normalizedEvent.action}'` : ""}`,
    });

    broadcast({
      type: "webhook.invoked",
      webhookId: webhook.id,
      webhookName: webhook.name,
      invocationId: dispatchRun.id,
      status: "error",
      error: `No matching dispatch rule for integration '${webhook.integrationType}'`,
    });

    return {
      httpStatus: 202,
      message: `Accepted but no matching dispatch rule for integration '${webhook.integrationType}'`,
    };
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
        title: matchedRule ? `GitHub: ${matchedRule.name}` : `Webhook: ${webhook.name}`,
        agentName: matchedRule?.agentName ?? webhook.agentName,
        sessionMode: webhook.sessionMode,
        approvalMode: webhook.approvalMode,
        sourceIp,
        userId: typeof webhook.userId === "string" ? webhook.userId : ctx.scopeUserId,
        scopeUserId: ctx.scopeUserId,
        ...(matchedRule ? { dispatchRuleId: matchedRule.id, integrationType: matchedRule.integrationType } : {}),
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
  console.log(`[webhooks] Process webhook ${webhook.id} in background for run ${dispatchRun.id}`);
  void processWebhookInBackground(webhook, dispatchRun.id, body, ctx, matchedRule).catch((err: unknown) => {
    console.error(`[webhooks] Background invocation ${dispatchRun.id} failed:`, err);
  });

  return { httpStatus: 202, message: "Accepted" };
}

async function processWebhookInBackground(
  webhook: { id: string; name: string; userId: string; agentName: string; promptTemplate: string; sessionMode: string; approvalMode: string },
  dispatchRunId: string,
  body: unknown,
  ctx: DispatchContext,
  dispatchRule: { id: string; name: string; integrationType: string; eventType: string; actionFilter: string | null; agentName: string; promptTemplate: string; contextKeyTemplate: string | null; approvalMode: string } | null,
): Promise<void> {
  const { db, serverUrl, broadcast } = ctx;
  let sessionId: string | undefined;
  const dispatchScopeUserId = getWebhookUserId(webhook);
  const contextKey = webhook.sessionMode === "persistent" ? extractContextKey(body) : undefined;
  let effectiveContextKey = contextKey;
  const existingMapping = await findContextMapping(db, contextKey);
  const metadataLookup = contextKey
    ? {
        sourceType: "webhook",
        sourceId: webhook.id,
        contextKey,
      }
    : undefined;

  try {
    const callbackBaseUrl =
      process.env.GATEWAY_INTERNAL_URL ?? process.env.GATEWAY_PUBLIC_URL ?? process.env.AUTH_URL ?? "http://localhost:3002";
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

    console.log(`[webhooks] Processing background run: ${dispatchRunId}`);
    const prompt = dispatchRule
      ? renderDispatchRuleTemplate(dispatchRule.promptTemplate, body)
      : renderPromptTemplate(webhook.promptTemplate, body);
    const derivedContextKey = dispatchRule?.contextKeyTemplate
      ? renderDispatchRuleTemplate(dispatchRule.contextKeyTemplate, body)
      : contextKey;
    effectiveContextKey = derivedContextKey || contextKey;
    const approvalRequired = (dispatchRule?.approvalMode ?? webhook.approvalMode) === "always";
    console.log(`[webhooks] Updating dispatch run ${dispatchRunId} with prompt`);
    await db.dispatchRun.update({
      where: { id: dispatchRunId },
      data: {
        renderedPrompt: prompt,
        contextKey: effectiveContextKey,
        status: approvalRequired ? "awaiting_approval" : "running",
        approvalRequired,
        approvalReason: approvalRequired ? "Webhook requires approval before execution" : null,
      },
    });

    if (approvalRequired) {
      console.log(`[webhooks] Approval required for run ${dispatchRunId}`);
      broadcast({
        type: "dispatch.approval_required",
        runId: dispatchRunId,
        sourceType: "webhook",
        sourceId: webhook.id,
        reason: "Webhook requires approval before execution",
      });
      return;
    }

    console.log(`[webhooks] Checking session for run ${dispatchRunId}`);
    if (!existingMapping && effectiveContextKey) {
      const reconciledSessionId = await findSessionIdByMetadata(serverUrl, {
        sourceType: "webhook",
        sourceId: webhook.id,
        contextKey: effectiveContextKey,
      }, dispatchScopeUserId);
      if (reconciledSessionId) {
        sessionId = reconciledSessionId;
        await reserveContextMapping(db, {
          key: effectiveContextKey,
          sourceType: "webhook",
          sourceId: webhook.id,
          sessionId,
          metadata: {
            ...(metadataLookup ?? {}),
            ...(dispatchRule ? { dispatchRuleId: dispatchRule.id } : {}),
            contextKey: effectiveContextKey,
          },
        });
      }
    }

    if (!existingMapping && effectiveContextKey && !sessionId) {
      sessionId = await createCognitionSession(serverUrl, {
        title: dispatchRule ? `GitHub: ${dispatchRule.name}` : `Webhook: ${webhook.name}`,
        agentName: dispatchRule?.agentName ?? webhook.agentName,
        scopeUserId: dispatchScopeUserId,
        metadata: {
          ...(metadataLookup ?? {}),
          ...(dispatchRule ? { dispatchRuleId: dispatchRule.id } : {}),
          contextKey: effectiveContextKey,
        },
      });

      await reserveContextMapping(db, {
        key: effectiveContextKey,
        sourceType: "webhook",
        sourceId: webhook.id,
        sessionId,
        metadata: {
          ...(metadataLookup ?? {}),
          ...(dispatchRule ? { dispatchRuleId: dispatchRule.id } : {}),
          contextKey: effectiveContextKey,
        },
      });
    }

    const dispatchResult = sessionId || existingMapping?.sessionId
      ? callbackUrl
        ? await enqueueDispatchInSession(serverUrl, {
            sessionId: sessionId ?? existingMapping?.sessionId ?? "",
            content: prompt,
            scopeUserId: dispatchScopeUserId,
            callbackUrl,
          })
        : await executeDispatchInSession(serverUrl, {
            sessionId: sessionId ?? existingMapping?.sessionId ?? "",
            content: prompt,
            scopeUserId: dispatchScopeUserId,
            callbackUrl,
          })
      : callbackUrl
        ? await enqueueDispatch(
            serverUrl,
            {
              title: dispatchRule ? `GitHub: ${dispatchRule.name}` : `Webhook: ${webhook.name}`,
              agentName: dispatchRule?.agentName ?? webhook.agentName,
              scopeUserId: dispatchScopeUserId,
              callbackUrl,
            },
            prompt,
          )
        : await executeDispatch(
            serverUrl,
            {
              title: dispatchRule ? `GitHub: ${dispatchRule.name}` : `Webhook: ${webhook.name}`,
              agentName: dispatchRule?.agentName ?? webhook.agentName,
              scopeUserId: dispatchScopeUserId,
             callbackUrl,
            },
            prompt,
          );
    console.log(`[webhooks] Dispatch result for run ${dispatchRunId}: ${JSON.stringify(dispatchResult)}`);
    sessionId = dispatchResult.sessionId;

    if (effectiveContextKey) {
      await upsertContextMapping(db, {
        key: effectiveContextKey,
        sourceType: "webhook",
        sourceId: webhook.id,
        sessionId,
        metadata: {
          ...(metadataLookup ?? {}),
          ...(dispatchRule ? { dispatchRuleId: dispatchRule.id } : {}),
          contextKey: effectiveContextKey,
        },
      });
    }

    if (callbackUrl && sessionId) {
      await markDispatchRunRunning(db, dispatchRunId, sessionId);
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

    if (effectiveContextKey && !existingMapping?.sessionId && sessionId) {
      await clearContextMapping(db, effectiveContextKey);
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
