import { useCallback, useRef } from "react";
import { useChatStore } from "@/hooks/use-chat-store";
import { extractArtifacts } from "@/lib/artifacts";
import type { CognitionSSEEvent, MessageResponse, SessionResumeRequest } from "@/types/cognition";

interface UseChatStreamOptions {
  sessionId: string;
  agentName?: string;
  providerId?: string | null;
  model?: string | null;
}

interface SendMessageOptions {
  content: string;
  parentId?: string;
  model?: string;
}

export function useChatStream({ sessionId, agentName, providerId, model }: UseChatStreamOptions) {
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastUserContentRef = useRef<string>("");

  const {
    startStream,
    appendToken,
    upsertToolCall,
    updateToolCallResult,
    setTodos,
    completeTodo,
    setStreamStatus,
    setStreamUsage,
    setInterrupt,
    finalizeStream,
    clearStream,
    appendMessage,
    setStreamError,
    updateSession,
    addArtifact,
  } = useChatStore();

  const handleSSEEvent = useCallback(
    (event: CognitionSSEEvent) => {
      switch (event.event) {
        case "token":
          appendToken(sessionId, event.data.content);
          break;

        case "tool_call":
          upsertToolCall(sessionId, {
            id: event.data.id,
            name: event.data.name,
            args: event.data.args,
            streaming: true,
          });
          break;

        case "tool_result":
          updateToolCallResult(
            sessionId,
            event.data.tool_call_id,
            event.data.output,
            event.data.exit_code
          );
          break;

        case "planning":
          setTodos(sessionId, event.data.todos);
          break;

        case "step_complete":
          completeTodo(sessionId, event.data.step_number);
          break;

        case "interrupt":
          setInterrupt(sessionId, {
            toolCallId: event.data.tool_call_id ?? null,
            toolName: event.data.tool_name ?? null,
            args: event.data.args ?? null,
            reason: event.data.reason ?? null,
            message: event.data.message ?? null,
          });
          setStreamStatus(sessionId, "waiting_for_approval");
          break;

        case "status":
          setStreamStatus(sessionId, event.data.status === "thinking"
            ? "thinking"
            : event.data.status === "waiting_for_approval"
              ? "waiting_for_approval"
              : "streaming");
          break;

        case "usage":
          setStreamUsage(sessionId, {
            input_tokens: event.data.input_tokens,
            output_tokens: event.data.output_tokens,
            estimated_cost: event.data.estimated_cost,
          });
          break;

        case "done": {
          const { assistant_data, message_id } = event.data;
          if (assistant_data && message_id) {
            const finalMessage: MessageResponse = {
              id: message_id,
              session_id: sessionId,
              role: "assistant",
              content: assistant_data.content,
              parent_id: null,
              model: assistant_data.model_used,
              created_at: new Date().toISOString(),
              tool_calls: assistant_data.tool_calls,
              tool_call_id: null,
              token_count: assistant_data.token_count,
              model_used: assistant_data.model_used,
              metadata: assistant_data.metadata,
            };
            finalizeStream(sessionId, finalMessage);
            setInterrupt(sessionId, null);

            if (assistant_data.content) {
              const extracted = extractArtifacts(assistant_data.content);
              for (const artifact of extracted) {
                addArtifact({
                  sessionId,
                  label: artifact.label,
                  content: artifact.content,
                  language: artifact.language,
                });
              }
            }

            const msgOrder = useChatStore.getState().messageOrderBySession.get(sessionId);
            const isFirstMessage = (msgOrder?.length ?? 0) <= 2;
            if (isFirstMessage) {
              const words = lastUserContentRef.current.trim().split(/\s+/).slice(0, 8).join(" ");
              const title = words.length > 60 ? words.slice(0, 57) + "…" : words;
              const patch: Record<string, unknown> = {};
              if (title) patch.title = title;
              const config: Record<string, unknown> = {};
              if (providerId) config.provider_id = providerId;
              if (model) config.model = model;
              if (Object.keys(config).length > 0) patch.config = config;
              if (Object.keys(patch).length > 0) {
                fetch(`/api/c/sessions/${sessionId}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(patch),
                })
                  .then((r) => r.ok ? r.json() : null)
                  .then((updated) => { if (updated) updateSession(updated); })
                  .catch(() => undefined);
              }
            }
          } else {
            clearStream(sessionId);
          }
          break;
        }

        case "error":
          setStreamError(sessionId, event.data.message ?? "An error occurred");
          break;

        case "delegation":
          setStreamStatus(sessionId, "streaming");
          break;

        case "reconnected":
          break;
      }
    },
    [
      sessionId,
      appendToken,
      upsertToolCall,
      updateToolCallResult,
      setTodos,
      completeTodo,
      setStreamStatus,
      setStreamUsage,
      setInterrupt,
      finalizeStream,
      clearStream,
      setStreamError,
      updateSession,
      addArtifact,
      providerId,
      model,
    ]
  );

  const sendMessage = useCallback(
    async ({ content, parentId, model }: SendMessageOptions) => {
      // Abort any existing stream for this session
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      // Capture user content for auto-titling
      lastUserContentRef.current = content;

      // Optimistically append user message
      const tempUserMessage: MessageResponse = {
        id: `temp-${Date.now()}`,
        session_id: sessionId,
        role: "user",
        content,
        parent_id: parentId ?? null,
        model: model ?? null,
        created_at: new Date().toISOString(),
        tool_calls: null,
        tool_call_id: null,
        token_count: null,
        model_used: null,
        metadata: null,
      };
      appendMessage(sessionId, tempUserMessage);

      // Start streaming state
      startStream(sessionId, agentName);
      setInterrupt(sessionId, null);

      try {
        const response = await fetch(`/api/c/sessions/${sessionId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content,
            ...(parentId && { parent_id: parentId }),
            ...(model && { model }),
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({ error: "Request failed" }));
          throw new Error(err.error ?? `HTTP ${response.status}`);
        }

        if (!response.body) {
          throw new Error("No response body");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let lastEventId: string | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          let currentEventType = "";
          let currentData = "";
          let currentId = "";

          for (const line of lines) {
            if (line.startsWith("id:")) {
              currentId = line.slice(3).trim();
              lastEventId = currentId;
            } else if (line.startsWith("event:")) {
              currentEventType = line.slice(6).trim();
            } else if (line.startsWith("data:")) {
              currentData = line.slice(5).trim();
            } else if (line === "" && currentEventType && currentData) {
              // Dispatch the event
              try {
                const parsed = JSON.parse(currentData) as Record<string, unknown>;
                const sseEvent = {
                  event: currentEventType,
                  data: parsed,
                } as CognitionSSEEvent;

                handleSSEEvent(sseEvent);
              } catch {
                // Ignore parse errors on individual events
              }
              currentEventType = "";
              currentData = "";
              currentId = "";
            }
          }
          void lastEventId;
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          // User aborted — clear stream state
          clearStream(sessionId);
          return;
        }

        const message = err instanceof Error ? err.message : "Streaming failed";
        console.error("Chat stream error:", message);
        setStreamError(sessionId, message);
      }
    },
    [
      sessionId,
      agentName,
      appendMessage,
      startStream,
      clearStream,
      appendToken,
      upsertToolCall,
      updateToolCallResult,
      setTodos,
      completeTodo,
      setStreamStatus,
      setStreamUsage,
      finalizeStream,
      setStreamError,
      updateSession,
        addArtifact,
        setInterrupt,
    ]
  );

  const resume = useCallback(
    async (request: SessionResumeRequest) => {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setStreamStatus(sessionId, "resuming");
      setInterrupt(sessionId, null);

      try {
        const response = await fetch(`/api/c/sessions/${sessionId}/resume`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
          signal: controller.signal,
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({ error: "Resume failed" }));
          throw new Error(err.error ?? `HTTP ${response.status}`);
        }

        if (!response.body) {
          throw new Error("No response body");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          let currentEventType = "";
          let currentData = "";

          for (const line of lines) {
            if (line.startsWith("event:")) {
              currentEventType = line.slice(6).trim();
            } else if (line.startsWith("data:")) {
              currentData = line.slice(5).trim();
            } else if (line === "" && currentEventType && currentData) {
              try {
                const parsed = JSON.parse(currentData) as Record<string, unknown>;
                const sseEvent = {
                  event: currentEventType,
                  data: parsed,
                } as CognitionSSEEvent;

                handleSSEEvent(sseEvent);
              } catch {
                // Ignore parse errors on individual events
              }

              currentEventType = "";
              currentData = "";
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          clearStream(sessionId);
          return;
        }

        const message = err instanceof Error ? err.message : "Resume failed";
        setStreamError(sessionId, message);
      }
    },
    [sessionId, clearStream, handleSSEEvent, setInterrupt, setStreamError, setStreamStatus]
  );

  const abort = useCallback(async () => {
    abortControllerRef.current?.abort();
    try {
      await fetch(`/api/c/sessions/${sessionId}/abort`, { method: "POST" });
    } catch {
      // Best-effort abort
    }
    clearStream(sessionId);
  }, [sessionId, clearStream]);

  return { sendMessage, abort, resume };
}
