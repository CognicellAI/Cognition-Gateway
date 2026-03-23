"use client";

import { CheckCircle2Icon, CircleIcon, LoaderIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Todo } from "@/types/cognition";

interface PlanningViewProps {
  todos: Todo[];
}

export function PlanningView({ todos }: PlanningViewProps) {
  if (todos.length === 0) return null;

  return (
    <div className="rounded-md border bg-muted/30 p-3 space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
        Plan
      </p>
      {todos.map((todo, i) => {
        const done = todo.status === "completed";
        const active = todo.status === "in_progress";
        return (
          <div key={i} className="flex items-start gap-2">
            {done ? (
              <CheckCircle2Icon className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" />
            ) : active ? (
              <LoaderIcon className="h-3.5 w-3.5 text-blue-500 mt-0.5 shrink-0 animate-spin" />
            ) : (
              <CircleIcon className="h-3.5 w-3.5 text-muted-foreground/50 mt-0.5 shrink-0" />
            )}
            <span
              className={cn(
                "text-sm",
                done && "text-muted-foreground line-through",
                active && "font-medium"
              )}
            >
              {todo.content}
            </span>
          </div>
        );
      })}
    </div>
  );
}