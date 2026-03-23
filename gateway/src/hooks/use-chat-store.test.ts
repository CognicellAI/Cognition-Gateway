import { describe, expect, it } from "vitest";
import { useChatStore } from "@/hooks/use-chat-store";

describe("useChatStore stream state", () => {
  it("stores interrupt state and waiting status", () => {
    const sessionId = "session-1";
    useChatStore.getState().startStream(sessionId, "default");

    useChatStore.getState().setInterrupt(sessionId, {
      toolCallId: "tool-1",
      toolName: "bash",
      args: { command: "ls" },
      reason: "approval needed",
      message: "Review tool call",
    });

    const stream = useChatStore.getState().streams.get(sessionId);
    expect(stream?.status).toBe("waiting_for_approval");
    expect(stream?.interrupt?.toolName).toBe("bash");
  });

  it("completes the expected todo step", () => {
    const sessionId = "session-2";
    useChatStore.getState().startStream(sessionId, "default");
    useChatStore.getState().setTodos(sessionId, [
      { content: "step 1", status: "in_progress" },
      { content: "step 2", status: "pending" },
    ]);

    useChatStore.getState().completeTodo(sessionId, 1);

    const stream = useChatStore.getState().streams.get(sessionId);
    expect(stream?.todos[0]?.status).toBe("completed");
    expect(stream?.currentStepIndex).toBe(1);
  });
});
