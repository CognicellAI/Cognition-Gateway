import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  consumeCognitionStream,
  createCognitionSession,
  sendCognitionMessage,
  buildDispatchCallbackUrl,
  parseCallbackOutcome,
  reserveContextMapping,
  upsertContextMapping,
  clearContextMapping,
  findContextMapping,
} from "@/lib/gateway/dispatch";

function createSseResponse(body: string): Response {
  return new Response(body, {
    headers: { "Content-Type": "text/event-stream" },
  });
}

describe("dispatch helpers", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("parses usage and done events from Cognition SSE", async () => {
    const response = createSseResponse([
      'event: usage',
      'data: {"data":{"input_tokens":12,"output_tokens":30}}',
      "",
      'event: done',
      'data: {"data":{"assistant_data":{"content":"Final answer"}}}',
      "",
    ].join("\n"));

    const result = await consumeCognitionStream(response);

    expect(result).toEqual({
      output: "Final answer",
      tokenUsage: 42,
    });
  });

  it("adds scope header when creating a Cognition session", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "session-1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const sessionId = await createCognitionSession("http://cognition", {
      title: "Test",
      agentName: "default",
      scopeUserId: "gateway-automation",
    });

    expect(sessionId).toBe("session-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get("x-cognition-scope-user")).toBe("gateway-automation");
  });

  it("adds scope header when sending a Cognition message", async () => {
    fetchMock.mockResolvedValueOnce(
      createSseResponse([
        'event: done',
        'data: {"assistant_data":{"content":"ok"}}',
        "",
      ].join("\n"))
    );

    await sendCognitionMessage("http://cognition", {
      sessionId: "session-1",
      content: "hello",
      scopeUserId: "gateway-automation",
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get("x-cognition-scope-user")).toBe("gateway-automation");
  });

  it("reserves, finalizes, and clears context mappings", async () => {
    const state = new Map<string, { sessionId: string; status: string }>();
    const db = {
      contextMapping: {
        findUnique: vi.fn(async ({ where }: { where: { key: string } }) => {
          const existing = state.get(where.key);
          return existing ? { sessionId: existing.sessionId, status: existing.status } : null;
        }),
        upsert: vi.fn(async ({ where, create, update }: any) => {
          const existing = state.get(where.key);
          state.set(where.key, existing ? { sessionId: update.sessionId, status: update.status } : { sessionId: create.sessionId, status: create.status });
        }),
        deleteMany: vi.fn(async ({ where }: { where: { key: string; status: string } }) => {
          const existing = state.get(where.key);
          if (existing?.status === where.status) {
            state.delete(where.key);
          }
        }),
      },
    } as any;

    await reserveContextMapping(db, {
      key: "ctx-1",
      sourceType: "webhook",
      sourceId: "wh-1",
      sessionId: "session-a",
    });
    await expect(findContextMapping(db, "ctx-1")).resolves.toEqual({
      sessionId: "session-a",
      status: "reserved",
    });

    await upsertContextMapping(db, {
      key: "ctx-1",
      sourceType: "webhook",
      sourceId: "wh-1",
      sessionId: "session-a",
    });
    await expect(findContextMapping(db, "ctx-1")).resolves.toEqual({
      sessionId: "session-a",
      status: "ready",
    });

    await reserveContextMapping(db, {
      key: "ctx-2",
      sourceType: "webhook",
      sourceId: "wh-2",
      sessionId: "session-b",
    });
    await clearContextMapping(db, "ctx-2");
    await expect(findContextMapping(db, "ctx-2")).resolves.toBeUndefined();
  });

  it("builds callback urls and parses callback outcomes", () => {
    const callbackUrl = buildDispatchCallbackUrl("http://localhost:3002", "token-1");
    expect(callbackUrl).toBe("http://localhost:3002/api/internal/dispatch/callback?token=token-1");

    expect(
      parseCallbackOutcome({
        session_id: "session-1",
        assistant_data: { content: "done" },
        usage: { input_tokens: 5, output_tokens: 7 },
      })
    ).toEqual({
      sessionId: "session-1",
      output: "done",
      tokenUsage: 12,
      error: undefined,
    });
  });
});
