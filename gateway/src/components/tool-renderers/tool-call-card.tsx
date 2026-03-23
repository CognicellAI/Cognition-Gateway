"use client";

import { useState } from "react";
import { ChevronDownIcon, ChevronRightIcon, CheckCircleIcon, XCircleIcon, TerminalIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ToolCall } from "@/types/cognition";

// Registry for specialized tool renderers — extend in Phase 2
const toolRenderers: Record<string, React.ComponentType<{ toolCall: ToolCall }>> = {};

interface GenericToolCardProps {
  toolCall: ToolCall;
}

function GenericToolCard({ toolCall }: GenericToolCardProps) {
  const [expanded, setExpanded] = useState(false);
  const hasOutput = toolCall.output !== undefined;
  const failed = hasOutput && toolCall.exit_code !== 0;

  return (
    <div className="rounded-md border bg-muted/50 text-sm overflow-hidden">
      <button
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/80 transition-colors"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
      >
        <TerminalIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="font-mono font-medium text-xs truncate">{toolCall.name}</span>

        {toolCall.streaming && !hasOutput && (
          <Badge variant="secondary" className="ml-auto text-xs">running</Badge>
        )}
        {hasOutput && (
          failed
            ? <XCircleIcon className="h-3.5 w-3.5 text-destructive ml-auto shrink-0" />
            : <CheckCircleIcon className="h-3.5 w-3.5 text-emerald-500 ml-auto shrink-0" />
        )}

        {expanded
          ? <ChevronDownIcon className={cn("h-3.5 w-3.5 text-muted-foreground", hasOutput ? "" : "ml-auto")} />
          : <ChevronRightIcon className={cn("h-3.5 w-3.5 text-muted-foreground", hasOutput ? "" : "ml-auto")} />}
      </button>

      {expanded && (
        <div className="border-t">
          {/* Args */}
          {Object.keys(toolCall.args).length > 0 && (
            <div className="px-3 py-2 border-b">
              <p className="text-xs text-muted-foreground mb-1">Arguments</p>
              <pre className="text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all">
                {JSON.stringify(toolCall.args, null, 2)}
              </pre>
            </div>
          )}
          {/* Output */}
          {hasOutput && (
            <div className="px-3 py-2">
              <p className="text-xs text-muted-foreground mb-1">
                Output
                {toolCall.exit_code !== undefined && toolCall.exit_code !== 0 && (
                  <span className="text-destructive ml-2">exit {toolCall.exit_code}</span>
                )}
              </p>
              <pre className={cn(
                "text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all",
                failed && "text-destructive"
              )}>
                {toolCall.output}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ToolCallCard({ toolCall }: { toolCall: ToolCall }) {
  const Renderer = toolRenderers[toolCall.name] ?? GenericToolCard;
  return <Renderer toolCall={toolCall} />;
}