"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import Link from "next/link";
import { SendIcon, SquareIcon, BotIcon, RefreshCwIcon, ExternalLinkIcon, Layers3Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageBubble, StreamingMessage } from "@/components/chat/message-bubble";
import { TaskCanvas } from "@/components/canvas/task-canvas";
import { ArtifactShelf } from "@/components/shelf/artifact-shelf";
import { ModelPicker } from "@/components/chat/model-picker";
import { useChatStore } from "@/hooks/use-chat-store";
import { useChatStream } from "@/hooks/use-chat-stream";
import type { AgentResponse, MessageResponse, ProviderResponse, SessionIssueContext } from "@/types/cognition";

interface ChatViewProps {
  sessionId: string;
}

export function ChatView({ sessionId }: ChatViewProps) {
  const [input, setInput] = useState("");
  const [agents, setAgents] = useState<AgentResponse[]>([]);
  const [selectedAgent, setSelectedAgent] = useState("default");
  const [providers, setProviders] = useState<ProviderResponse[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string>("");
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [lastUserContent, setLastUserContent] = useState<string | null>(null);
  const [issueContext, setIssueContext] = useState<SessionIssueContext | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const {
    messagesBySession,
    messageOrderBySession,
    streams,
    setMessages,
    setActiveSessionId,
    clearStream,
    artifactsBySession,
  } = useChatStore();

  const stream = streams.get(sessionId);
  const isStreaming = stream?.status !== "idle" && stream !== undefined &&
    (stream.status === "streaming" || stream.status === "thinking" || stream.status === "resuming");
  const streamError = stream?.error ?? null;

  const { sendMessage, abort, resume } = useChatStream({
    sessionId,
    agentName: selectedAgent,
    providerId: selectedProviderId || null,
    model: selectedModel || null,
  });

  const handleResume = useCallback(
    async (action: "approve" | "reject" | "edit", content?: string) => {
      await resume({
        action,
        ...(content?.trim() ? { content: content.trim() } : {}),
      });
    },
    [resume]
  );

  // Load messages and agents on mount
  useEffect(() => {
    setActiveSessionId(sessionId);

    async function load() {
      try {
        const [msgsRes, agentsRes, providersRes] = await Promise.all([
          fetch(`/api/c/sessions/${sessionId}/messages?limit=100`),
          fetch("/api/c/agents"),
          fetch("/api/c/models/providers"),
        ]);

        if (msgsRes.ok) {
          const data = await msgsRes.json();
          setMessages(sessionId, data.messages ?? []);
          setMessagesError(null);
          setIssueContext(extractIssueContext(data.messages ?? [], sessionId));
        } else if (msgsRes.status === 404) {
          const reconstructed = await reconstructMessagesFromActivity(sessionId);
          if (reconstructed.length > 0) {
            setMessages(sessionId, reconstructed);
            setMessagesError(null);
            setIssueContext(extractIssueContext(reconstructed, sessionId));
          }
        } else {
          setMessagesError(`Failed to load messages (${msgsRes.status})`);
        }
        if (agentsRes.ok) {
          const data = await agentsRes.json();
          const primaryAgents = (data.agents ?? []).filter(
            (a: AgentResponse) => !a.hidden && (a.mode === "primary" || a.mode === "all")
          );
          setAgents(primaryAgents);
        }
        if (providersRes.ok) {
          const data = await providersRes.json();
          const enabledProviders = (data.providers ?? []).filter((p: ProviderResponse) => p.enabled);
          setProviders(enabledProviders);
        }
      } finally {
        setMessagesLoading(false);
      }
    }

    load();

    return () => setActiveSessionId(null);
  }, [sessionId, setMessages, setActiveSessionId]);

  // Auto-scroll to bottom on new content
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [
    messageOrderBySession.get(sessionId)?.length,
    stream?.content,
    stream?.toolCalls.length,
  ]);

  const artifacts = artifactsBySession.get(sessionId) ?? [];

  const handleSend = useCallback(async () => {
    let content = input.trim();
    if (!content || isStreaming) return;

    // Resolve @label references to artifact content
    if (artifacts.length > 0 && content.includes("@")) {
      for (const artifact of artifacts) {
        const ref = `@${artifact.label}`;
        if (content.includes(ref)) {
          content = content.replace(
            ref,
            `\n\n[${artifact.label}]\n\`\`\`\n${artifact.content}\n\`\`\`\n`,
          );
        }
      }
    }

    setInput("");
    setLastUserContent(content);
    await sendMessage({ content });
  }, [input, isStreaming, sendMessage, artifacts]);

  const handleRetry = useCallback(async () => {
    if (!lastUserContent || isStreaming) return;
    clearStream(sessionId);
    await sendMessage({ content: lastUserContent });
  }, [lastUserContent, isStreaming, clearStream, sessionId, sendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const msgMap = messagesBySession.get(sessionId);
  const msgOrder = messageOrderBySession.get(sessionId) ?? [];
  const messages: MessageResponse[] = msgOrder
    .map((id) => msgMap?.get(id))
    .filter((m): m is MessageResponse => m !== undefined);

  return (
    <div className="flex h-full overflow-hidden">
      {/* Conversation column */}
      <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
      {/* Message list */}
      <div className="flex-1 min-h-0">
      <ScrollArea className="h-full px-4 py-4">
        <div className="mx-auto max-w-3xl space-y-4">
          {issueContext && <IssueWorkbenchHeader context={issueContext} />}
          {messagesLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className={`h-12 w-3/4 rounded-xl ${i % 2 === 0 ? "ml-auto" : ""}`} />
              ))}
            </div>
          ) : messagesError ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {messagesError}
            </div>
          ) : messages.length === 0 && !isStreaming ? (
            <EmptyState agentName={selectedAgent} />
          ) : (
            <>
              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}
              {isStreaming && stream && (
                <StreamingMessage
                  content={stream.content}
                  toolCalls={stream.toolCalls}
                  todos={stream.todos}
                  status={stream.status}
                  interrupt={stream.interrupt}
                  delegations={stream.delegations}
                  onResume={handleResume}
                />
              )}
              {streamError && !isStreaming && (
                <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  <span className="flex-1">{streamError}</span>
                  {lastUserContent && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 shrink-0 gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/20"
                      onClick={handleRetry}
                    >
                      <RefreshCwIcon className="h-3.5 w-3.5" />
                      Retry
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>
      </div>

      {/* Usage info */}
      {stream?.usage && (
        <div className="border-t px-4 py-1.5 flex items-center gap-4 text-xs text-muted-foreground bg-muted/30">
          <span>{stream.usage.input_tokens + stream.usage.output_tokens} tokens</span>
          {stream.usage.estimated_cost > 0 && (
            <span>${stream.usage.estimated_cost.toFixed(5)}</span>
          )}
        </div>
      )}

      {/* Artifact Shelf */}
      <ArtifactShelf sessionId={sessionId} />

      {/* Input area */}
      <div className="border-t bg-background px-4 py-3">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-end gap-2">
            {/* Agent selector */}
            {agents.length > 1 && (
              <Select value={selectedAgent} onValueChange={setSelectedAgent} disabled={isStreaming}>
                <SelectTrigger className="w-36 h-9 shrink-0">
                  <BotIcon className="h-3.5 w-3.5 mr-1.5" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((a) => (
                    <SelectItem key={a.name} value={a.name}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Model picker (provider + model in one popover) */}
            {providers.length > 0 && (
              <ModelPicker
                providers={providers}
                selectedProviderId={selectedProviderId}
                selectedModel={selectedModel}
                onProviderChange={setSelectedProviderId}
                onModelChange={setSelectedModel}
                disabled={isStreaming}
              />
            )}

            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={artifacts.length > 0 ? "Message… (use @label to reference an artifact)" : "Message…"}
              className="min-h-[44px] max-h-48 resize-none flex-1 py-2.5"
              disabled={isStreaming}
              rows={1}
            />

            {isStreaming ? (
              <Button variant="destructive" size="icon" onClick={abort} className="shrink-0">
                <SquareIcon className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                size="icon"
                onClick={handleSend}
                disabled={!input.trim()}
                className="shrink-0"
              >
                <SendIcon className="h-4 w-4" />
              </Button>
            )}
          </div>
          <p className="mt-1.5 text-center text-xs text-muted-foreground">
            Enter to send · Shift+Enter for new line
          </p>
        </div>
      </div>
      </div>
      {/* Task Canvas — sibling to conversation column */}
      <TaskCanvas sessionId={sessionId} />
    </div>
  );
}

function extractIssueContext(messages: MessageResponse[], sessionId: string): SessionIssueContext | null {
  for (const message of messages) {
    const metadata = message.metadata;
    if (!metadata || typeof metadata !== "object") {
      continue;
    }

    const sourceType = typeof metadata.sourceType === "string" ? metadata.sourceType : null;
    if (sourceType !== "webhook") {
      continue;
    }

    return {
      sourceType,
      sourceId: typeof metadata.sourceId === "string" ? metadata.sourceId : "",
      title: typeof metadata.title === "string" ? metadata.title : null,
      runIntent: typeof metadata.runIntent === "string" ? metadata.runIntent : null,
      resourceType: typeof metadata.resourceType === "string" ? metadata.resourceType : null,
      dispatchRuleId: typeof metadata.dispatchRuleId === "string" ? metadata.dispatchRuleId : null,
      workspaceScopeKey: typeof metadata.scopeKey === "string" ? metadata.scopeKey : null,
      runtimeType: typeof metadata.runtimeType === "string" ? metadata.runtimeType : null,
      activityRunId: sessionId,
    };
  }

  return null;
}

function IssueWorkbenchHeader({ context }: { context: SessionIssueContext }) {
  return (
    <Card className="border-border/70 bg-muted/20">
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{context.sourceType}</Badge>
          {context.resourceType && <Badge variant="secondary">{context.resourceType}</Badge>}
          {context.runIntent && <Badge>{context.runIntent}</Badge>}
          {context.dispatchRuleId && <Badge variant="outline">rule {context.dispatchRuleId}</Badge>}
        </div>

        <div>
          <p className="text-sm font-medium">{context.title ?? "Issue work session"}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            This session is tied to a routed integration event and can be used as the interactive workbench for triage or follow-on implementation.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {context.workspaceScopeKey && (
            <span className="inline-flex items-center gap-1 rounded-full border px-2 py-1">
              <Layers3Icon className="h-3 w-3" />
              {context.workspaceScopeKey}
            </span>
          )}
          {context.runtimeType && (
            <span className="inline-flex items-center gap-1 rounded-full border px-2 py-1">
              runtime: {context.runtimeType}
            </span>
          )}
          {context.activityRunId && (
            <Link href={`/activity`} className="inline-flex items-center gap-1 rounded-full border px-2 py-1 hover:bg-muted/50">
              Activity <ExternalLinkIcon className="h-3 w-3" />
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

async function reconstructMessagesFromActivity(sessionId: string): Promise<MessageResponse[]> {
  const response = await fetch("/api/activity");
  if (!response.ok) {
    return [];
  }

  const data = await response.json() as { runs?: Array<{ sessionId?: string | null; renderedPrompt?: string | null; output?: string | null; startedAt?: string; finishedAt?: string | null; }> };
  const run = (data.runs ?? []).find((candidate) => candidate.sessionId === sessionId);
  if (!run?.renderedPrompt) {
    return [];
  }

  const createdAt = run.startedAt ?? new Date().toISOString();
  const messages: MessageResponse[] = [
    {
      id: `${sessionId}-reconstructed-user`,
      session_id: sessionId,
      role: "user",
      content: run.renderedPrompt,
      parent_id: null,
      model: null,
      created_at: createdAt,
      tool_calls: null,
      tool_call_id: null,
      token_count: null,
      model_used: null,
      metadata: { reconstructed: true },
    },
  ];

  if (typeof run.output === "string") {
    messages.push({
      id: `${sessionId}-reconstructed-assistant`,
      session_id: sessionId,
      role: "assistant",
      content: run.output,
      parent_id: messages[0].id,
      model: null,
      created_at: run.finishedAt ?? createdAt,
      tool_calls: null,
      tool_call_id: null,
      token_count: null,
      model_used: null,
      metadata: { reconstructed: true },
    });
  }

  return messages;
}

function EmptyState({ agentName }: { agentName: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="rounded-full bg-muted p-4 mb-4">
        <BotIcon className="h-8 w-8 text-muted-foreground" />
      </div>
      <h2 className="text-lg font-semibold mb-1">Start a conversation</h2>
      <p className="text-sm text-muted-foreground max-w-sm">
        You&apos;re chatting with the <strong>{agentName}</strong> agent.
        Send a message to get started.
      </p>
    </div>
  );
}
