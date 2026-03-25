"use client";

import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { ToolCallCard } from "@/components/tool-renderers/tool-call-card";
import { PlanningView } from "@/components/chat/planning-view";
import { cn } from "@/lib/utils";
import type { DelegationEvent, ExecutionLogMetadata, MessageResponse, ToolCall, Todo } from "@/types/cognition";
import type { InterruptState } from "@/types/cognition";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";

interface MessageBubbleProps {
  message: MessageResponse;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const metadata = (message.metadata ?? {}) as ExecutionLogMetadata;
  const persistedDelegations = metadata.delegations ?? [];
  const hasExecutionLog = !isUser && ((message.tool_calls?.length ?? 0) > 0 || persistedDelegations.length > 0);
  const [executionLogExpanded, setExecutionLogExpanded] = useState(false);
  const executionLogSectionCount = (persistedDelegations.length > 0 ? 1 : 0) + ((message.tool_calls?.length ?? 0) > 0 ? 1 : 0);

  return (
    <div className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] space-y-2",
          isUser
            ? "bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-4 py-2.5"
            : "text-foreground"
        )}
      >
        {message.content && (
          <div className={cn("prose prose-sm dark:prose-invert max-w-none", isUser && "prose-invert")}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}

        {hasExecutionLog && (
          <div className="mt-3 rounded-xl border border-border/70 bg-muted/20 overflow-hidden">
            <button
              type="button"
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/40 transition-colors"
              onClick={() => setExecutionLogExpanded((current) => !current)}
              aria-expanded={executionLogExpanded}
            >
              {executionLogExpanded ? (
                <ChevronDownIcon className="h-4 w-4 text-muted-foreground shrink-0" />
              ) : (
                <ChevronRightIcon className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Execution Log
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {executionLogSectionCount} section{executionLogSectionCount === 1 ? "" : "s"}
                  {persistedDelegations.length > 0 ? " • delegation" : ""}
                  {(message.tool_calls?.length ?? 0) > 0 ? ` • ${message.tool_calls?.length ?? 0} tool call${(message.tool_calls?.length ?? 0) === 1 ? "" : "s"}` : ""}
                </p>
              </div>
            </button>

            {executionLogExpanded && (
              <div className="space-y-3 border-t border-border/60 p-3">
                {persistedDelegations.length > 0 && (
                  <div className="space-y-2 rounded-lg border bg-background/70 p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Delegation Activity
                    </p>
                    {persistedDelegations.map((delegation, index) => (
                      <div key={`${delegation.createdAt}-${index}`} className="rounded-md border bg-background/80 p-2 text-sm">
                        <p>
                          <span className="font-medium">{delegation.fromAgent}</span>
                          {" delegated to "}
                          <span className="font-medium">{delegation.toAgent}</span>
                        </p>
                        <p className="mt-1 text-muted-foreground">{delegation.task}</p>
                      </div>
                    ))}
                  </div>
                )}

                {message.tool_calls && message.tool_calls.length > 0 && (
                  <div className="space-y-2 rounded-lg border bg-background/70 p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Tool Calls
                    </p>
                    <div className="space-y-1.5">
                      {message.tool_calls.map((tc) => (
                        <ToolCallCard
                          key={tc.id}
                          toolCall={{ ...tc, args: tc.args as Record<string, unknown> }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface StreamingMessageProps {
  content: string;
  toolCalls: ToolCall[];
  todos: Todo[];
  status: "idle" | "streaming" | "thinking" | "waiting_for_approval" | "resuming";
  interrupt: InterruptState | null;
  onResume?: (action: "approve" | "reject" | "edit", content?: string) => void;
  delegations?: DelegationEvent[];
}

export function StreamingMessage({ content, toolCalls, todos, status, interrupt, onResume, delegations = [] }: StreamingMessageProps) {
  const [editedContent, setEditedContent] = useState("");

  return (
    <div className="flex w-full justify-start">
      <div className="max-w-[85%] text-foreground space-y-2">
        {/* Planning */}
        {todos.length > 0 && <PlanningView todos={todos} />}

        {interrupt && (
          <div className="rounded-md border border-amber-500/40 bg-amber-50/70 p-3 space-y-3 dark:bg-amber-950/20">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300">
                Approval Required
              </p>
              <p className="mt-1 text-sm font-medium">
                {interrupt.toolName ?? "Tool call"}
              </p>
              {interrupt.reason && (
                <p className="mt-1 text-sm text-muted-foreground">{interrupt.reason}</p>
              )}
              {interrupt.message && (
                <p className="mt-1 text-sm text-muted-foreground">{interrupt.message}</p>
              )}
            </div>

            {interrupt.args && (
              <pre className="overflow-x-auto rounded-md bg-background/70 p-3 text-xs">
                {JSON.stringify(interrupt.args, null, 2)}
              </pre>
            )}

            <Textarea
              value={editedContent}
              onChange={(e) => setEditedContent(e.target.value)}
              placeholder="Optional edited instruction or justification"
              className="min-h-[88px]"
            />

            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => onResume?.("approve")}>Approve</Button>
              <Button size="sm" variant="outline" onClick={() => onResume?.("edit", editedContent)}>
                Approve with edit
              </Button>
              <Button size="sm" variant="destructive" onClick={() => onResume?.("reject")}>Reject</Button>
            </div>
          </div>
        )}

        {/* Tool calls in flight */}
        {toolCalls.length > 0 && (
          <div className="space-y-1.5">
            {toolCalls.map((tc) => (
              <ToolCallCard key={tc.id} toolCall={tc} />
            ))}
          </div>
        )}

        {delegations.length > 0 && (
          <div className="space-y-2 rounded-md border bg-muted/30 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Delegation Activity
            </p>
            {delegations.map((delegation, index) => (
              <div key={`${delegation.createdAt}-${index}`} className="rounded-md border bg-background/80 p-2 text-sm">
                <p>
                  <span className="font-medium">{delegation.fromAgent}</span>
                  {" delegated to "}
                  <span className="font-medium">{delegation.toAgent}</span>
                </p>
                <p className="mt-1 text-muted-foreground">{delegation.task}</p>
              </div>
            ))}
          </div>
        )}

        {/* Streaming text */}
        {(content || status === "thinking" || status === "resuming") && (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            {content ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                {content}
              </ReactMarkdown>
            ) : null}
            {/* Blinking cursor */}
            <span className="inline-block w-2 h-4 bg-foreground/70 ml-0.5 animate-pulse align-text-bottom" />
          </div>
        )}
      </div>
    </div>
  );
}
