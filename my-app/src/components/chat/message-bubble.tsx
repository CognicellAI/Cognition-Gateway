"use client";

import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { ToolCallCard } from "@/components/tool-renderers/tool-call-card";
import { PlanningView } from "@/components/chat/planning-view";
import { cn } from "@/lib/utils";
import type { MessageResponse, ToolCall, Todo } from "@/types/cognition";

interface MessageBubbleProps {
  message: MessageResponse;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";

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
        {/* Tool calls on assistant messages */}
        {!isUser && message.tool_calls && message.tool_calls.length > 0 && (
          <div className="space-y-1.5 mt-2">
            {message.tool_calls.map((tc) => (
              <ToolCallCard
                key={tc.id}
                toolCall={{ ...tc, args: tc.args as Record<string, unknown> }}
              />
            ))}
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
  status: "streaming" | "thinking";
}

export function StreamingMessage({ content, toolCalls, todos, status }: StreamingMessageProps) {
  return (
    <div className="flex w-full justify-start">
      <div className="max-w-[85%] text-foreground space-y-2">
        {/* Planning */}
        {todos.length > 0 && <PlanningView todos={todos} />}

        {/* Tool calls in flight */}
        {toolCalls.length > 0 && (
          <div className="space-y-1.5">
            {toolCalls.map((tc) => (
              <ToolCallCard key={tc.id} toolCall={tc} />
            ))}
          </div>
        )}

        {/* Streaming text */}
        {(content || status === "thinking") && (
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