/**
 * Webhook ingress — Layer 2–3 (Gateway Core / API)
 *
 * Validates HMAC signatures, renders prompt templates, creates Cognition
 * sessions, and persists WebhookInvocation records.
 *
 * This module is server-only. It must not import React or any Next.js page/component module.
 */

import { createHmac, timingSafeEqual } from "crypto";
import type { PrismaClient } from "@prisma/client";
import type { BroadcastFn } from "./cron";

interface WebhookContext {
  db: PrismaClient;
  serverUrl: string;
  broadcast: BroadcastFn;
}

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
  ctx: WebhookContext,
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

  const invocation = await db.webhookInvocation.create({
    data: {
      webhookId: webhook.id,
      status: "running",
      sourceIp,
    },
  });

  broadcast({
    type: "webhook_invocation_started",
    webhookId: webhook.id,
    webhookName: webhook.name,
    invocationId: invocation.id,
  });

  // Run asynchronously — don't block the HTTP response
  void processWebhookInBackground(webhook, invocation.id, body, ctx);

  return { httpStatus: 202, message: "Accepted" };
}

async function processWebhookInBackground(
  webhook: { id: string; name: string; agentName: string; promptTemplate: string; sessionMode: string },
  invocationId: string,
  body: unknown,
  ctx: WebhookContext,
): Promise<void> {
  const { db, serverUrl, broadcast } = ctx;
  let sessionId: string | undefined;

  try {
    const prompt = renderPromptTemplate(webhook.promptTemplate, body);

    // Create a Cognition session
    const sessionRes = await fetch(`${serverUrl}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: `Webhook: ${webhook.name}`, agent_name: webhook.agentName }),
    });
    if (!sessionRes.ok) {
      throw new Error(
        `Failed to create session: ${sessionRes.status} ${await sessionRes.text()}`,
      );
    }
    const session = (await sessionRes.json()) as { id: string };
    sessionId = session.id;

    // Send the prompt
    const msgRes = await fetch(`${serverUrl}/sessions/${sessionId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({ content: prompt }),
    });
    if (!msgRes.ok) {
      throw new Error(
        `Failed to send message: ${msgRes.status} ${await msgRes.text()}`,
      );
    }

    // Drain the stream (we don't need the output for webhooks, just completion)
    const reader = msgRes.body?.getReader();
    if (reader) {
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }
    }

    await db.webhookInvocation.update({
      where: { id: invocationId },
      data: { status: "success", sessionId, finishedAt: new Date() },
    });

    broadcast({
      type: "webhook_invocation_completed",
      webhookId: webhook.id,
      webhookName: webhook.name,
      invocationId,
      status: "success",
      sessionId,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[webhooks] Invocation ${invocationId} failed:`, error);

    await db.webhookInvocation.update({
      where: { id: invocationId },
      data: { status: "error", sessionId, error, finishedAt: new Date() },
    });

    broadcast({
      type: "webhook_invocation_completed",
      webhookId: webhook.id,
      webhookName: webhook.name,
      invocationId,
      status: "error",
      error,
    });
  }
}
