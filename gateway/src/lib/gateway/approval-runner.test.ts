import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/gateway/dispatch", () => ({
  executeDispatch: vi.fn(),
  executeDispatchInSession: vi.fn(),
  findMappedSessionId: vi.fn(),
  markDispatchRunError: vi.fn(),
  markDispatchRunRunning: vi.fn(),
  markDispatchRunSuccess: vi.fn(),
  upsertContextMapping: vi.fn(),
}));

import { executeApprovedDispatchRun } from "@/lib/gateway/approval-runner";
import {
  executeDispatch,
  executeDispatchInSession,
  findMappedSessionId,
  markDispatchRunError,
  markDispatchRunRunning,
  markDispatchRunSuccess,
  upsertContextMapping,
} from "@/lib/gateway/dispatch";

describe("approval runner", () => {
  const broadcast = vi.fn();
  const db = {
    dispatchRun: {
      findUnique: vi.fn(),
    },
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("executes approved queued runs and marks them successful", async () => {
    db.dispatchRun.findUnique.mockResolvedValue({
      id: "run-1",
      status: "queued",
      sourceType: "webhook",
      sourceId: "wh-1",
      metadata: JSON.stringify({ title: "Webhook", agentName: "default" }),
      renderedPrompt: "hello",
      contextKey: "ctx-1",
      sessionId: null,
    });
    vi.mocked(findMappedSessionId).mockResolvedValue(undefined);
    vi.mocked(executeDispatch).mockResolvedValue({
      sessionId: "session-1",
      output: "done",
      tokenUsage: 10,
      doneReceived: true,
    });

    await executeApprovedDispatchRun("run-1", {
      db,
      serverUrl: "http://cognition",
      broadcast,
      scopeUserId: "gateway-automation",
    });

    expect(markDispatchRunRunning).toHaveBeenCalledWith(db, "run-1");
    expect(executeDispatch).toHaveBeenCalled();
    expect(markDispatchRunSuccess).toHaveBeenCalledWith(db, "run-1", {
      sessionId: "session-1",
      output: "done",
      tokenUsage: 10,
    });
    expect(upsertContextMapping).toHaveBeenCalled();
    expect(broadcast).toHaveBeenCalledWith(
      expect.objectContaining({ type: "dispatch.run.complete", runId: "run-1", status: "success" })
    );
  });

  it("marks failed approved runs as error", async () => {
    db.dispatchRun.findUnique.mockResolvedValue({
      id: "run-2",
      status: "queued",
      sourceType: "webhook",
      sourceId: "wh-2",
      metadata: JSON.stringify({ title: "Webhook", agentName: "default" }),
      renderedPrompt: "hello",
      contextKey: null,
      sessionId: null,
    });
    vi.mocked(findMappedSessionId).mockResolvedValue(undefined);
    vi.mocked(executeDispatch).mockRejectedValue(new Error("boom"));

    await executeApprovedDispatchRun("run-2", {
      db,
      serverUrl: "http://cognition",
      broadcast,
      scopeUserId: "gateway-automation",
    });

    expect(markDispatchRunError).toHaveBeenCalledWith(db, "run-2", {
      sessionId: undefined,
      error: "boom",
    });
    expect(broadcast).toHaveBeenCalledWith(
      expect.objectContaining({ type: "dispatch.run.failed", runId: "run-2", status: "error" })
    );
    expect(executeDispatchInSession).not.toHaveBeenCalled();
  });
});
