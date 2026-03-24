import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import {
  markDispatchRunError,
  markDispatchRunRunning,
  markDispatchRunSuccess,
  parseCallbackOutcome,
  type DispatchCallbackPayload,
} from "@/lib/gateway/dispatch";

interface CognitionMessageRecord {
  id: string;
  role: string;
  content: string | null;
  model_used?: string | null;
  metadata?: Record<string, unknown> | string | null;
}

async function hydrateOutputFromCognition(
  callbackUrl: string | null | undefined,
  sessionId: string | undefined,
  scopeUserId: string | undefined,
): Promise<{ output?: string; tokenUsage?: number }> {
  if (!callbackUrl || !sessionId) {
    return {};
  }

  const callback = new URL(callbackUrl);
  const host = callback.hostname;
  const port = callback.port ? `:${callback.port}` : "";
  const serverUrl = host === "gateway" ? `http://cognition:8000` : `${callback.protocol}//${host}${port}`;
  const response = await fetch(`${serverUrl}/sessions/${sessionId}/messages?limit=100`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...(scopeUserId ? { "x-cognition-scope-user": scopeUserId } : {}),
    },
  });

  if (!response.ok) {
    return {};
  }

  const payload = (await response.json()) as {
    messages?: CognitionMessageRecord[];
    items?: CognitionMessageRecord[];
  };

  const messages = payload.messages ?? payload.items ?? [];
  const assistantMessages = messages.filter((message) => message.role === "assistant");
  const lastAssistantMessage = assistantMessages.at(-1);
  if (!lastAssistantMessage) {
    return {};
  }

  let tokenUsage: number | undefined;
  const metadata = lastAssistantMessage.metadata;
  if (typeof metadata === "string") {
    try {
      const parsed = JSON.parse(metadata) as { input_tokens?: unknown; output_tokens?: unknown };
      tokenUsage =
        (typeof parsed.input_tokens === "number" ? parsed.input_tokens : 0) +
        (typeof parsed.output_tokens === "number" ? parsed.output_tokens : 0);
    } catch {
      tokenUsage = undefined;
    }
  } else if (metadata && typeof metadata === "object") {
    const parsed = metadata as { input_tokens?: unknown; output_tokens?: unknown };
    tokenUsage =
      (typeof parsed.input_tokens === "number" ? parsed.input_tokens : 0) +
      (typeof parsed.output_tokens === "number" ? parsed.output_tokens : 0);
  }

  return {
    output: lastAssistantMessage.content ?? "",
    tokenUsage,
  };
}

export async function POST(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const run = await db.dispatchRun.findFirst({
    where: { callbackToken: token },
    select: { id: true, callbackUrl: true, metadata: true },
  });

  if (!run) {
    return NextResponse.json({ error: "Dispatch run not found" }, { status: 404 });
  }

  const payload = (await request.json()) as DispatchCallbackPayload;
  const outcome = parseCallbackOutcome(payload);
  const metadata = run.metadata ? JSON.parse(run.metadata) as { userId?: unknown } : null;
  const scopeUserId = typeof metadata?.userId === "string" ? metadata.userId : undefined;
  const hydrated = await hydrateOutputFromCognition(run.callbackUrl, outcome.sessionId, scopeUserId);
  const output = hydrated.output ?? outcome.output;
  const tokenUsage = hydrated.tokenUsage ?? outcome.tokenUsage;

  if (outcome.sessionId) {
    await markDispatchRunRunning(db, run.id, outcome.sessionId);
  }

  if (outcome.error) {
    await markDispatchRunError(db, run.id, {
      sessionId: outcome.sessionId,
      error: outcome.error,
    });
  } else {
    await markDispatchRunSuccess(db, run.id, {
      sessionId: outcome.sessionId ?? "",
      output,
      tokenUsage,
    });
  }

  return NextResponse.json({ ok: true });
}
