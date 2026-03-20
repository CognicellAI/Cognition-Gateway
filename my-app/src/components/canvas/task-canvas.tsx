"use client";

import { useMemo } from "react";
import {
  CheckCircle2Icon,
  CircleIcon,
  LoaderIcon,
  ChevronRightIcon,
  TerminalIcon,
  XCircleIcon,
  PanelRightIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useChatStore } from "@/hooks/use-chat-store";
import { cn } from "@/lib/utils";
import type { ToolCall, Todo } from "@/types/cognition";

interface TaskCanvasProps {
  sessionId: string;
}

/**
 * Live Task Canvas — shows the agent's plan and associated tool calls
 * as a persistent side panel. Updates in real-time during streaming
 * and persists after the run completes as an audit trail.
 */
export function TaskCanvas({ sessionId }: TaskCanvasProps) {
  const { streams, canvasOpen, setCanvasOpen } = useChatStore();
  const stream = streams.get(sessionId);

  const todos = stream?.todos ?? [];
  const toolCalls = stream?.toolCalls ?? [];
  const isStreaming = stream?.status === "streaming" || stream?.status === "thinking";
  const completedSteps = todos.filter((t) => t.status === "completed").length;
  const hasContent = todos.length > 0 || toolCalls.length > 0;

  // Group tool calls by stepIndex
  const toolCallsByStep = useMemo(() => {
    const map = new Map<number, ToolCall[]>();
    for (const tc of toolCalls) {
      const step = tc.stepIndex ?? -1;
      const existing = map.get(step) ?? [];
      map.set(step, [...existing, tc]);
    }
    return map;
  }, [toolCalls]);

  // Ungrouped tool calls (no plan)
  const ungroupedCalls = toolCallsByStep.get(-1) ?? [];

  if (!canvasOpen) {
    return (
      <div className="flex flex-col items-center border-l bg-muted/20 w-10 shrink-0 pt-3 gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setCanvasOpen(true)}
          title="Open task canvas"
        >
          <PanelRightIcon className="h-4 w-4" />
        </Button>
        {isStreaming && (
          <LoaderIcon className="h-3.5 w-3.5 text-muted-foreground animate-spin" />
        )}
        {!isStreaming && todos.length > 0 && (
          <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4 rotate-90 origin-center">
            {completedSteps}/{todos.length}
          </Badge>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col border-l bg-muted/20 w-72 shrink-0">
      {/* Header */}
      <div className="flex h-12 items-center justify-between px-3 border-b">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Task Canvas</span>
          {isStreaming && (
            <LoaderIcon className="h-3.5 w-3.5 text-muted-foreground animate-spin" />
          )}
          {!isStreaming && todos.length > 0 && (
            <Badge variant="outline" className="text-xs">
              {completedSteps}/{todos.length}
            </Badge>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setCanvasOpen(false)}
        >
          <ChevronRightIcon className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-1">
          {!hasContent && !isStreaming && (
            <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
              <CircleIcon className="h-8 w-8 opacity-20" />
              <p className="text-xs">
                The task canvas appears when the agent plans and uses tools.
              </p>
            </div>
          )}

          {/* Steps with attached tool calls */}
          {todos.length > 0 && todos.map((todo, i) => (
            <StepRow
              key={i}
              todo={todo}
              stepIndex={i}
              toolCalls={toolCallsByStep.get(i) ?? []}
              isActive={isStreaming && stream?.currentStepIndex === i}
            />
          ))}

          {/* Tool calls not attached to any plan step */}
          {ungroupedCalls.length > 0 && (
            <div className="space-y-1 pt-1">
              {todos.length > 0 && (
                <p className="text-xs text-muted-foreground px-1 pb-1">Other tool calls</p>
              )}
              {ungroupedCalls.map((tc) => (
                <ToolCallRow key={tc.id} toolCall={tc} />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function StepRow({
  todo,
  stepIndex,
  toolCalls,
  isActive,
}: {
  todo: Todo;
  stepIndex: number;
  toolCalls: ToolCall[];
  isActive: boolean;
}) {
  const isCompleted = todo.status === "completed";
  const isPending = todo.status === "pending" && !isActive;

  return (
    <div className="space-y-0.5">
      {/* Step header */}
      <div
        className={cn(
          "flex items-start gap-2 rounded-md px-2 py-1.5 text-sm",
          isActive && "bg-accent",
        )}
      >
        <span className="mt-0.5 shrink-0">
          {isCompleted ? (
            <CheckCircle2Icon className="h-3.5 w-3.5 text-emerald-500" />
          ) : isActive ? (
            <LoaderIcon className="h-3.5 w-3.5 text-primary animate-spin" />
          ) : (
            <CircleIcon className="h-3.5 w-3.5 text-muted-foreground/40" />
          )}
        </span>
        <span
          className={cn(
            "leading-snug",
            isCompleted && "line-through text-muted-foreground",
            isPending && "text-muted-foreground/60",
            isActive && "font-medium",
          )}
        >
          {todo.content}
        </span>
      </div>

      {/* Attached tool calls */}
      {toolCalls.length > 0 && (
        <div className="ml-5 space-y-0.5">
          {toolCalls.map((tc) => (
            <ToolCallRow key={tc.id} toolCall={tc} compact />
          ))}
        </div>
      )}
    </div>
  );
}

function ToolCallRow({
  toolCall,
  compact = false,
}: {
  toolCall: ToolCall;
  compact?: boolean;
}) {
  const hasOutput = toolCall.output !== undefined;
  const isRunning = toolCall.streaming && !hasOutput;
  const isError = hasOutput && toolCall.exit_code !== undefined && toolCall.exit_code !== 0;
  const isSuccess = hasOutput && !isError;

  // Summarise args as a single line
  const argSummary = useMemo(() => {
    const entries = Object.entries(toolCall.args ?? {});
    if (entries.length === 0) return null;
    return entries
      .slice(0, 2)
      .map(([k, v]) => {
        const val = typeof v === "string" ? v : JSON.stringify(v);
        const truncated = val.length > 40 ? val.slice(0, 37) + "…" : val;
        return `${k}: ${truncated}`;
      })
      .join("  ");
  }, [toolCall.args]);

  // Summarise output
  const outputSummary = useMemo(() => {
    if (!toolCall.output) return null;
    const lines = toolCall.output.split("\n").filter(Boolean);
    if (lines.length === 0) return "(empty)";
    if (lines.length === 1) return lines[0].slice(0, 80);
    return `${lines[0].slice(0, 60)}… (${lines.length} lines)`;
  }, [toolCall.output]);

  return (
    <div
      className={cn(
        "rounded border bg-background/60 text-xs font-mono",
        compact ? "px-2 py-1" : "px-2.5 py-1.5",
      )}
    >
      {/* Tool name + status */}
      <div className="flex items-center gap-1.5">
        <TerminalIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
        <span className="font-semibold">{toolCall.name}</span>
        {isRunning && (
          <LoaderIcon className="h-3 w-3 text-muted-foreground animate-spin ml-auto" />
        )}
        {isSuccess && (
          <CheckCircle2Icon className="h-3 w-3 text-emerald-500 ml-auto" />
        )}
        {isError && (
          <XCircleIcon className="h-3 w-3 text-destructive ml-auto" />
        )}
      </div>

      {/* Args summary */}
      {argSummary && (
        <p className="mt-0.5 text-muted-foreground truncate">{argSummary}</p>
      )}

      {/* Output summary */}
      {outputSummary && (
        <p
          className={cn(
            "mt-0.5 truncate",
            isError ? "text-destructive" : "text-foreground/70",
          )}
        >
          {isError && toolCall.exit_code !== undefined && (
            <span className="text-destructive mr-1">exit {toolCall.exit_code}</span>
          )}
          {outputSummary}
        </p>
      )}
    </div>
  );
}
