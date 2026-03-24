import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({
  db: {
    dispatchRun: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/lib/gateway/dispatch", () => ({
  markDispatchRunError: vi.fn(),
  markDispatchRunRunning: vi.fn(),
  markDispatchRunSuccess: vi.fn(),
  parseCallbackOutcome: vi.fn(),
}));

import { POST } from "@/app/api/internal/dispatch/callback/route";
import { db } from "@/lib/db/client";
import { markDispatchRunError, markDispatchRunRunning, markDispatchRunSuccess, parseCallbackOutcome } from "@/lib/gateway/dispatch";

describe("dispatch callback route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks a dispatch run as success from callback payload", async () => {
    vi.mocked(db.dispatchRun.findFirst).mockResolvedValue({ id: "run-1", callbackUrl: "http://gateway:3000/callback?token=abc", metadata: JSON.stringify({ userId: "user-1" }) } as never);
    vi.mocked(parseCallbackOutcome).mockReturnValue({
      sessionId: "session-1",
      output: "done",
      tokenUsage: 12,
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          messages: [
            {
              id: "assistant-1",
              role: "assistant",
              content: "hydrated output",
              metadata: { input_tokens: 5, output_tokens: 7 },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const response = await POST(
      new Request("http://localhost:3000/api/internal/dispatch/callback?token=abc", {
        method: "POST",
        body: JSON.stringify({ hello: "world" }),
        headers: { "Content-Type": "application/json" },
      })
    );

    expect(response.status).toBe(200);
    expect(markDispatchRunRunning).toHaveBeenCalledWith(expect.anything(), "run-1", "session-1");
    expect(markDispatchRunSuccess).toHaveBeenCalledWith(expect.anything(), "run-1", {
      sessionId: "session-1",
      output: "hydrated output",
      tokenUsage: 12,
    });
  });

  it("marks a dispatch run as error from callback payload", async () => {
    vi.mocked(db.dispatchRun.findFirst).mockResolvedValue({ id: "run-2", callbackUrl: null, metadata: null } as never);
    vi.mocked(parseCallbackOutcome).mockReturnValue({
      sessionId: "session-2",
      output: "",
      tokenUsage: 0,
      error: "failed",
    });

    const response = await POST(
      new Request("http://localhost:3000/api/internal/dispatch/callback?token=def", {
        method: "POST",
        body: JSON.stringify({ hello: "world" }),
        headers: { "Content-Type": "application/json" },
      })
    );

    expect(response.status).toBe(200);
    expect(markDispatchRunRunning).toHaveBeenCalledWith(expect.anything(), "run-2", "session-2");
    expect(markDispatchRunError).toHaveBeenCalledWith(expect.anything(), "run-2", {
      sessionId: "session-2",
      error: "failed",
    });
  });
});
