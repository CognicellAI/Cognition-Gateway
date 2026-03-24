import type { PrismaClient } from "@prisma/client";

export type BroadcastFn = (message: unknown) => void;

export interface DispatchContext {
  db: PrismaClient;
  serverUrl: string;
  broadcast: BroadcastFn;
  scopeUserId?: string;
}

export interface DispatchStreamResult {
  output: string;
  tokenUsage: number;
  doneReceived: boolean;
}

export interface DispatchSessionRequest {
  title: string;
  agentName: string;
  scopeUserId?: string;
  callbackUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface DispatchMessageRequest {
  sessionId: string;
  content: string;
  scopeUserId?: string;
  callbackUrl?: string;
}

function buildScopedHeaders(
  scopeUserId: string | undefined,
  baseHeaders?: HeadersInit,
): Headers {
  const headers = new Headers(baseHeaders);

  if (scopeUserId) {
    headers.set("x-cognition-scope-user", scopeUserId);
  }

  return headers;
}

export interface DispatchExecutionResult extends DispatchStreamResult {
  sessionId: string;
  callbackToken?: string;
}

export interface DispatchEnqueueResult {
  sessionId: string;
}

export interface DispatchRunSeed {
  sourceType: "cron" | "webhook" | "integration";
  sourceId: string;
  status?: string;
  renderedPrompt?: string;
  contextKey?: string;
  approvalRequired?: boolean;
  approvalReason?: string;
  callbackToken?: string;
  callbackUrl?: string | null;
  metadata?: Record<string, unknown>;
  cronJobId?: string;
  webhookId?: string;
}

export interface PendingDispatchExecutionInput {
  runId: string;
  db: PrismaClient;
  serverUrl: string;
  broadcast: BroadcastFn;
}

export interface DispatchRunSuccessUpdate {
  sessionId: string;
  output: string;
  tokenUsage: number;
  finishedAt?: Date;
}

export interface DispatchRunErrorUpdate {
  sessionId?: string;
  error: string;
  finishedAt?: Date;
}

export interface DispatchCallbackPayload {
  session_id?: string;
  message_id?: string;
  assistant_data?: {
    content?: string;
    token_count?: number;
    metadata?: Record<string, unknown> | null;
  };
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  error?: string;
}

/**
 * Consume a Cognition SSE stream until the `done` event, collecting final
 * output text and token totals from `usage` events.
 */
export async function consumeCognitionStream(response: Response): Promise<DispatchStreamResult> {
  const reader = response.body?.getReader();
  if (!reader) {
    return { output: "", tokenUsage: 0, doneReceived: false };
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let output = "";
  let tokenUsage = 0;
  let doneReceived = false;
  let currentEventName = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.startsWith("event: ")) {
        currentEventName = line.slice(7).trim();
        continue;
      }

      if (!line.trim()) {
        currentEventName = "";
        continue;
      }

      if (!line.startsWith("data: ")) {
        continue;
      }

      try {
        const payload = JSON.parse(line.slice(6)) as {
          event?: string;
          data?: {
            assistant_data?: { content?: string };
            input_tokens?: number;
            output_tokens?: number;
          };
          assistant_data?: { content?: string };
        };

        const eventName =
          typeof payload.event === "string" ? payload.event : currentEventName;

        if (eventName === "done" && payload.data?.assistant_data?.content) {
          doneReceived = true;
          output = payload.data.assistant_data.content;
        }

        if (eventName === "usage") {
          tokenUsage =
            (payload.data?.input_tokens ?? 0) + (payload.data?.output_tokens ?? 0);
        }

        if (!output && eventName === "done" && typeof payload.assistant_data?.content === "string") {
          doneReceived = true;
          output = payload.assistant_data.content;
        }
      } catch {
        // Ignore unparseable lines.
      }
    }
  }

  return { output, tokenUsage, doneReceived };
}

export async function createCognitionSession(
  serverUrl: string,
  request: DispatchSessionRequest,
): Promise<string> {
  const sessionResponse = await fetch(`${serverUrl}/sessions`, {
    method: "POST",
    headers: buildScopedHeaders(request.scopeUserId, {
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({
      title: request.title,
      agent_name: request.agentName,
      ...(request.callbackUrl ? { callback_url: request.callbackUrl } : {}),
      ...(request.metadata ? { metadata: request.metadata } : {}),
    }),
  });

  if (!sessionResponse.ok) {
    throw new Error(
      `Failed to create session: ${sessionResponse.status} ${await sessionResponse.text()}`,
    );
  }

  const session = (await sessionResponse.json()) as { id: string };
  return session.id;
}

export async function sendCognitionMessage(
  serverUrl: string,
  request: DispatchMessageRequest,
): Promise<DispatchStreamResult> {
  const messageResponse = await fetch(`${serverUrl}/sessions/${request.sessionId}/messages`, {
    method: "POST",
    headers: buildScopedHeaders(request.scopeUserId, {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    }),
    body: JSON.stringify({
      content: request.content,
      ...(request.callbackUrl ? { callback_url: request.callbackUrl } : {}),
    }),
  });

  if (!messageResponse.ok) {
    throw new Error(
      `Failed to send message: ${messageResponse.status} ${await messageResponse.text()}`,
    );
  }

  return consumeCognitionStream(messageResponse);
}

export async function executeDispatch(
  serverUrl: string,
  sessionRequest: DispatchSessionRequest,
  messageContent: string,
): Promise<DispatchExecutionResult> {
  const sessionId = await createCognitionSession(serverUrl, sessionRequest);
  const streamResult = await sendCognitionMessage(serverUrl, {
    sessionId,
    content: messageContent,
    scopeUserId: sessionRequest.scopeUserId,
  });

  return {
    sessionId,
    output: streamResult.output,
    tokenUsage: streamResult.tokenUsage,
    doneReceived: streamResult.doneReceived,
  };
}

export async function executeDispatchInSession(
  serverUrl: string,
  request: DispatchMessageRequest,
): Promise<DispatchExecutionResult> {
  const streamResult = await sendCognitionMessage(serverUrl, request);

  return {
    sessionId: request.sessionId,
    output: streamResult.output,
    tokenUsage: streamResult.tokenUsage,
    doneReceived: streamResult.doneReceived,
  };
}

export async function enqueueDispatchInSession(
  serverUrl: string,
  request: DispatchMessageRequest,
): Promise<DispatchEnqueueResult> {
  const response = await fetch(`${serverUrl}/sessions/${request.sessionId}/messages`, {
    method: "POST",
    headers: buildScopedHeaders(request.scopeUserId, {
      "Content-Type": "application/json",
      Accept: "application/json",
    }),
    body: JSON.stringify({
      content: request.content,
      ...(request.callbackUrl ? { callback_url: request.callbackUrl } : {}),
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to enqueue message: ${response.status} ${await response.text()}`,
    );
  }

  return { sessionId: request.sessionId };
}

export async function enqueueDispatch(
  serverUrl: string,
  sessionRequest: DispatchSessionRequest,
  messageContent: string,
): Promise<DispatchEnqueueResult> {
  const sessionId = await createCognitionSession(serverUrl, sessionRequest);
  await enqueueDispatchInSession(serverUrl, {
    sessionId,
    content: messageContent,
    scopeUserId: sessionRequest.scopeUserId,
    callbackUrl: sessionRequest.callbackUrl,
  });
  return { sessionId };
}

export async function createDispatchRun(
  db: PrismaClient,
  seed: DispatchRunSeed,
): Promise<{ id: string }> {
  return db.dispatchRun.create({
    data: {
      sourceType: seed.sourceType,
      sourceId: seed.sourceId,
      status: seed.status ?? "running",
      renderedPrompt: seed.renderedPrompt,
      contextKey: seed.contextKey,
      approvalRequired: seed.approvalRequired ?? false,
      approvalReason: seed.approvalReason,
      callbackToken: seed.callbackToken,
      callbackUrl: seed.callbackUrl,
      metadata: seed.metadata ? JSON.stringify(seed.metadata) : undefined,
      cronJobId: seed.cronJobId,
      webhookId: seed.webhookId,
    },
    select: { id: true },
  });
}

export async function findMappedSessionId(
  db: PrismaClient,
  contextKey: string | undefined,
): Promise<string | undefined> {
  if (!contextKey) {
    return undefined;
  }

  const mapping = await db.contextMapping.findUnique({
    where: { key: contextKey },
    select: { sessionId: true },
  });

  return mapping?.sessionId;
}

export async function findContextMapping(
  db: PrismaClient,
  contextKey: string | undefined,
): Promise<{ sessionId: string; status: string } | undefined> {
  if (!contextKey) {
    return undefined;
  }

  const mapping = await db.contextMapping.findUnique({
    where: { key: contextKey },
    select: { sessionId: true, status: true },
  });

  return mapping ?? undefined;
}

export async function reserveContextMapping(
  db: PrismaClient,
  input: {
    key: string;
    sourceType: string;
    sourceId?: string;
    sessionId: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await db.contextMapping.upsert({
    where: { key: input.key },
    create: {
      key: input.key,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      sessionId: input.sessionId,
      status: "reserved",
      metadata: input.metadata ? JSON.stringify(input.metadata) : undefined,
    },
    update: {
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      sessionId: input.sessionId,
      status: "reserved",
      metadata: input.metadata ? JSON.stringify(input.metadata) : undefined,
    },
  });
}

export async function upsertContextMapping(
  db: PrismaClient,
  input: {
    key: string;
    sourceType: string;
    sourceId?: string;
    sessionId: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await db.contextMapping.upsert({
    where: { key: input.key },
    create: {
      key: input.key,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      sessionId: input.sessionId,
      status: "ready",
      metadata: input.metadata ? JSON.stringify(input.metadata) : undefined,
    },
    update: {
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      sessionId: input.sessionId,
      status: "ready",
      metadata: input.metadata ? JSON.stringify(input.metadata) : undefined,
    },
  });
}

export async function clearContextMapping(
  db: PrismaClient,
  contextKey: string | undefined,
): Promise<void> {
  if (!contextKey) {
    return;
  }

  await db.contextMapping.deleteMany({
    where: { key: contextKey, status: "reserved" },
  });
}

export async function markDispatchRunSuccess(
  db: PrismaClient,
  dispatchRunId: string,
  result: DispatchRunSuccessUpdate,
): Promise<void> {
  await db.dispatchRun.update({
    where: { id: dispatchRunId },
    data: {
      status: "success",
      sessionId: result.sessionId,
      output: result.output,
      tokenUsage: result.tokenUsage,
      finishedAt: result.finishedAt ?? new Date(),
    },
  });
}

export async function markDispatchRunError(
  db: PrismaClient,
  dispatchRunId: string,
  result: DispatchRunErrorUpdate,
): Promise<void> {
  await db.dispatchRun.update({
    where: { id: dispatchRunId },
    data: {
      status: "error",
      sessionId: result.sessionId,
      error: result.error,
      finishedAt: result.finishedAt ?? new Date(),
    },
  });
}

export async function markDispatchRunRunning(
  db: PrismaClient,
  dispatchRunId: string,
  sessionId?: string,
): Promise<void> {
  await db.dispatchRun.update({
    where: { id: dispatchRunId },
    data: {
      status: "running",
      sessionId,
      finishedAt: null,
    },
  });
}

export function generateCallbackToken(): string {
  return crypto.randomUUID();
}

export function buildDispatchCallbackUrl(baseUrl: string, token: string): string {
  const url = new URL("/api/internal/dispatch/callback", baseUrl);
  url.searchParams.set("token", token);
  return url.toString();
}

export async function findSessionIdByMetadata(
  serverUrl: string,
  metadata: Record<string, string>,
  scopeUserId?: string,
): Promise<string | undefined> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(metadata)) {
    params.set(`metadata.${key}`, value);
  }

  const response = await fetch(`${serverUrl}/sessions?${params.toString()}`, {
    method: "GET",
    headers: buildScopedHeaders(scopeUserId),
  });

  if (!response.ok) {
    throw new Error(`Failed to look up sessions by metadata: ${response.status} ${await response.text()}`);
  }

  const payload = (await response.json()) as {
    sessions?: Array<{ id: string }>;
    items?: Array<{ id: string }>;
  };

  const sessions = payload.sessions ?? payload.items ?? [];
  return sessions[0]?.id;
}

export function parseCallbackOutcome(payload: DispatchCallbackPayload): {
  sessionId?: string;
  output: string;
  tokenUsage: number;
  error?: string;
} {
  const usage = payload.usage;
  return {
    sessionId: payload.session_id,
    output: payload.assistant_data?.content ?? "",
    tokenUsage: (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0),
    error: payload.error,
  };
}
