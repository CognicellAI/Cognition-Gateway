import { create } from "zustand";
import type {
  ExecutionLogMetadata,
  SessionSummary,
  MessageResponse,
  ToolCall,
  Todo,
  InterruptState,
  DelegationEvent,
} from "@/types/cognition";

export interface Artifact {
  id: string;
  sessionId: string;
  label: string;       // display name, e.g. "script.py" or "Summary"
  content: string;     // full text content
  language?: string;   // detected language for code blocks
  createdAt: number;   // timestamp for ordering
}

export interface StreamState {
  status: "idle" | "streaming" | "thinking" | "waiting_for_approval" | "resuming";
  content: string;
  toolCalls: ToolCall[];
  todos: Todo[];
  activeAgent: string;
  usage: { input_tokens: number; output_tokens: number; estimated_cost: number } | null;
  error: string | null;
  currentStepIndex: number; // tracks which plan step is active for tool call association
  interrupt: InterruptState | null;
  delegations: DelegationEvent[];
}

interface Notification {
  id: string;
  message: string;
  type: "info" | "success" | "error";
  timestamp: string;
}

interface ChatStore {
  // Sessions
  sessions: SessionSummary[];
  activeSessionId: string | null;

  // Messages — tree-ready: sessionId -> messageId -> Message
  messagesBySession: Map<string, Map<string, MessageResponse>>;
  // Ordered message IDs for flat list rendering
  messageOrderBySession: Map<string, string[]>;

  // Active streams — supports concurrent background streams
  streams: Map<string, StreamState>;

  // Artifacts — per-session pinned outputs
  artifactsBySession: Map<string, Artifact[]>;

  // UI state
  sidebarOpen: boolean;
  canvasOpen: boolean;
  notifications: Notification[];

  // Actions — sessions
  setSessions: (sessions: SessionSummary[]) => void;
  addSession: (session: SessionSummary) => void;
  updateSession: (session: SessionSummary) => void;
  removeSession: (sessionId: string) => void;
  setActiveSessionId: (sessionId: string | null) => void;

  // Actions — messages
  setMessages: (sessionId: string, messages: MessageResponse[]) => void;
  appendMessage: (sessionId: string, message: MessageResponse) => void;
  updateMessage: (sessionId: string, messageId: string, updates: Partial<MessageResponse>) => void;

  // Actions — streams
  startStream: (sessionId: string, agentName?: string) => void;
  appendToken: (sessionId: string, token: string) => void;
  upsertToolCall: (sessionId: string, toolCall: ToolCall) => void;
  updateToolCallResult: (sessionId: string, toolCallId: string, output: string, exitCode: number) => void;
  setTodos: (sessionId: string, todos: Todo[]) => void;
  completeTodo: (sessionId: string, stepNumber: number) => void;
  setStreamStatus: (sessionId: string, status: StreamState["status"]) => void;
  setStreamUsage: (sessionId: string, usage: StreamState["usage"]) => void;
  setInterrupt: (sessionId: string, interrupt: InterruptState | null) => void;
  addDelegation: (sessionId: string, delegation: Omit<DelegationEvent, "createdAt">) => void;
  finalizeStream: (sessionId: string, message: MessageResponse) => void;
  clearStream: (sessionId: string) => void;
  setStreamError: (sessionId: string, error: string) => void;

  // Actions — UI
  setSidebarOpen: (open: boolean) => void;
  setCanvasOpen: (open: boolean) => void;
  addNotification: (notification: Omit<Notification, "id" | "timestamp">) => void;
  removeNotification: (id: string) => void;

  // Actions — artifacts
  addArtifact: (artifact: Omit<Artifact, "id" | "createdAt">) => void;
  removeArtifact: (sessionId: string, artifactId: string) => void;
  clearArtifacts: (sessionId: string) => void;
}

const defaultStreamState = (): StreamState => ({
  status: "idle",
  content: "",
  toolCalls: [],
  todos: [],
  activeAgent: "default",
  usage: null,
  error: null,
  currentStepIndex: 0,
  interrupt: null,
  delegations: [],
});

export const useChatStore = create<ChatStore>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  messagesBySession: new Map(),
  messageOrderBySession: new Map(),
  streams: new Map(),
  artifactsBySession: new Map(),
  sidebarOpen: true,
  canvasOpen: true,
  notifications: [],

  // --- Sessions ---
  setSessions: (sessions) => set({ sessions }),

  addSession: (session) =>
    set((s) => ({ sessions: [session, ...s.sessions] })),

  updateSession: (session) =>
    set((s) => ({
      sessions: s.sessions.map((ses) =>
        ses.id === session.id ? session : ses
      ),
    })),

  removeSession: (sessionId) =>
    set((s) => {
      const messagesBySession = new Map(s.messagesBySession);
      const messageOrderBySession = new Map(s.messageOrderBySession);
      const streams = new Map(s.streams);
      messagesBySession.delete(sessionId);
      messageOrderBySession.delete(sessionId);
      streams.delete(sessionId);
      return {
        sessions: s.sessions.filter((ses) => ses.id !== sessionId),
        activeSessionId:
          s.activeSessionId === sessionId ? null : s.activeSessionId,
        messagesBySession,
        messageOrderBySession,
        streams,
      };
    }),

  setActiveSessionId: (sessionId) => set({ activeSessionId: sessionId }),

  // --- Messages ---
  setMessages: (sessionId, messages) =>
    set((s) => {
      const messagesBySession = new Map(s.messagesBySession);
      const messageOrderBySession = new Map(s.messageOrderBySession);
      const msgMap = new Map<string, MessageResponse>();
      const order: string[] = [];
      for (const msg of messages) {
        msgMap.set(msg.id, msg);
        order.push(msg.id);
      }
      messagesBySession.set(sessionId, msgMap);
      messageOrderBySession.set(sessionId, order);
      return { messagesBySession, messageOrderBySession };
    }),

  appendMessage: (sessionId, message) =>
    set((s) => {
      const messagesBySession = new Map(s.messagesBySession);
      const messageOrderBySession = new Map(s.messageOrderBySession);
      const msgMap = new Map(messagesBySession.get(sessionId) ?? []);
      const order = [...(messageOrderBySession.get(sessionId) ?? [])];
      if (!msgMap.has(message.id)) {
        msgMap.set(message.id, message);
        order.push(message.id);
      }
      messagesBySession.set(sessionId, msgMap);
      messageOrderBySession.set(sessionId, order);
      return { messagesBySession, messageOrderBySession };
    }),

  updateMessage: (sessionId, messageId, updates) =>
    set((s) => {
      const messagesBySession = new Map(s.messagesBySession);
      const msgMap = new Map(messagesBySession.get(sessionId) ?? []);
      const existing = msgMap.get(messageId);
      if (existing) {
        msgMap.set(messageId, { ...existing, ...updates });
        messagesBySession.set(sessionId, msgMap);
      }
      return { messagesBySession };
    }),

  // --- Streams ---
  startStream: (sessionId, agentName = "default") =>
    set((s) => {
      const streams = new Map(s.streams);
      streams.set(sessionId, { ...defaultStreamState(), activeAgent: agentName, status: "streaming" });
      return { streams };
    }),

  appendToken: (sessionId, token) =>
    set((s) => {
      const streams = new Map(s.streams);
      const stream = streams.get(sessionId) ?? defaultStreamState();
      streams.set(sessionId, { ...stream, content: stream.content + token });
      return { streams };
    }),

  upsertToolCall: (sessionId, toolCall) =>
    set((s) => {
      const streams = new Map(s.streams);
      const stream = streams.get(sessionId) ?? defaultStreamState();
      // Stamp current step index onto new tool calls
      const enriched: ToolCall = {
        ...toolCall,
        stepIndex: toolCall.stepIndex ?? stream.currentStepIndex,
      };
      const existing = stream.toolCalls.findIndex((tc) => tc.id === enriched.id);
      const toolCalls =
        existing >= 0
          ? stream.toolCalls.map((tc, i) => (i === existing ? { ...tc, ...enriched } : tc))
          : [...stream.toolCalls, enriched];
      streams.set(sessionId, { ...stream, toolCalls });
      return { streams };
    }),

  updateToolCallResult: (sessionId, toolCallId, output, exitCode) =>
    set((s) => {
      const streams = new Map(s.streams);
      const stream = streams.get(sessionId) ?? defaultStreamState();
      const toolCalls = stream.toolCalls.map((tc) =>
        tc.id === toolCallId ? { ...tc, output, exit_code: exitCode, streaming: false } : tc
      );
      streams.set(sessionId, { ...stream, toolCalls });
      return { streams };
    }),

  setTodos: (sessionId, todos) =>
    set((s) => {
      const streams = new Map(s.streams);
      const stream = streams.get(sessionId) ?? defaultStreamState();
      streams.set(sessionId, { ...stream, todos });
      return { streams };
    }),

  completeTodo: (sessionId, stepNumber) =>
    set((s) => {
      const streams = new Map(s.streams);
      const stream = streams.get(sessionId);
      if (!stream) return {};
      const todos = stream.todos.map((todo, i) =>
        i === stepNumber - 1 ? { ...todo, status: "completed" } : todo
      );
      // Advance current step index to the next step
      const nextStepIndex = stepNumber; // stepNumber is 1-indexed, so this is the next 0-indexed step
      streams.set(sessionId, { ...stream, todos, currentStepIndex: nextStepIndex });
      return { streams };
    }),

  setStreamStatus: (sessionId, status) =>
    set((s) => {
      const streams = new Map(s.streams);
      const stream = streams.get(sessionId) ?? defaultStreamState();
      streams.set(sessionId, { ...stream, status });
      return { streams };
    }),

  setStreamUsage: (sessionId, usage) =>
    set((s) => {
      const streams = new Map(s.streams);
      const stream = streams.get(sessionId) ?? defaultStreamState();
      streams.set(sessionId, { ...stream, usage });
      return { streams };
    }),

  setInterrupt: (sessionId, interrupt) =>
    set((s) => {
      const streams = new Map(s.streams);
      const stream = streams.get(sessionId) ?? defaultStreamState();
      streams.set(sessionId, {
        ...stream,
        interrupt,
        status: interrupt ? "waiting_for_approval" : stream.status,
      });
      return { streams };
    }),

  addDelegation: (sessionId, delegation) =>
    set((s) => {
      const streams = new Map(s.streams);
      const stream = streams.get(sessionId) ?? defaultStreamState();
      streams.set(sessionId, {
        ...stream,
        delegations: [
          ...stream.delegations,
          {
            ...delegation,
            createdAt: new Date().toISOString(),
          },
        ],
      });
      return { streams };
    }),

  finalizeStream: (sessionId, message) => {
    const { appendMessage, clearStream } = get();
    const stream = get().streams.get(sessionId) ?? defaultStreamState();
    const metadata = {
      ...(message.metadata ?? {}),
      ...(stream.delegations.length > 0 ? { delegations: stream.delegations } : {}),
    } satisfies ExecutionLogMetadata & Record<string, unknown>;

    appendMessage(sessionId, {
      ...message,
      metadata,
    });
    // Update session message count
    set((s) => ({
      sessions: s.sessions.map((ses) =>
        ses.id === sessionId
          ? { ...ses, message_count: ses.message_count + 1 }
          : ses
      ),
    }));
    clearStream(sessionId);
  },

  clearStream: (sessionId) =>
    set((s) => {
      const streams = new Map(s.streams);
      streams.set(sessionId, defaultStreamState());
      return { streams };
    }),

  setStreamError: (sessionId, error) =>
    set((s) => {
      const streams = new Map(s.streams);
      const stream = streams.get(sessionId) ?? defaultStreamState();
      streams.set(sessionId, { ...stream, status: "idle", error, interrupt: null });
      return { streams };
    }),

  // --- UI ---
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setCanvasOpen: (canvasOpen) => set({ canvasOpen }),

  addNotification: (notification) =>
    set((s) => ({
      notifications: [
        ...s.notifications,
        {
          ...notification,
          id: Math.random().toString(36).slice(2),
          timestamp: new Date().toISOString(),
        },
      ],
    })),

  removeNotification: (id) =>
    set((s) => ({
      notifications: s.notifications.filter((n) => n.id !== id),
    })),

  // --- Artifacts ---
  addArtifact: (artifact) =>
    set((s) => {
      const artifactsBySession = new Map(s.artifactsBySession);
      const existing = artifactsBySession.get(artifact.sessionId) ?? [];
      const newArtifact: Artifact = {
        ...artifact,
        id: Math.random().toString(36).slice(2),
        createdAt: Date.now(),
      };
      artifactsBySession.set(artifact.sessionId, [...existing, newArtifact]);
      return { artifactsBySession };
    }),

  removeArtifact: (sessionId, artifactId) =>
    set((s) => {
      const artifactsBySession = new Map(s.artifactsBySession);
      const existing = artifactsBySession.get(sessionId) ?? [];
      artifactsBySession.set(sessionId, existing.filter((a) => a.id !== artifactId));
      return { artifactsBySession };
    }),

  clearArtifacts: (sessionId) =>
    set((s) => {
      const artifactsBySession = new Map(s.artifactsBySession);
      artifactsBySession.set(sessionId, []);
      return { artifactsBySession };
    }),
}));
