"use client";

import { useEffect, useState } from "react";
import { ActivityIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import type { HealthStatus } from "@/types/cognition";
import { cn } from "@/lib/utils";

type HealthState = "healthy" | "degraded" | "unreachable";

export function ServerHealthIndicator() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [state, setState] = useState<HealthState>("unreachable");

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const res = await fetch("/api/c/health", { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) setState("degraded");
          return;
        }
        const data: HealthStatus = await res.json();
        if (!cancelled) {
          setHealth(data);
          setState(data.status === "healthy" ? "healthy" : "degraded");
        }
      } catch {
        if (!cancelled) setState("unreachable");
      }
    }

    check();
    const interval = setInterval(check, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const dot: Record<HealthState, string> = {
    healthy: "bg-emerald-500",
    degraded: "bg-amber-500",
    unreachable: "bg-rose-500",
  };

  const label: Record<HealthState, string> = {
    healthy: "Connected",
    degraded: "Degraded",
    unreachable: "Unreachable",
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1.5 cursor-default select-none">
          <span
            className={cn(
              "h-2 w-2 rounded-full shrink-0",
              dot[state],
              state === "healthy" && "animate-pulse"
            )}
          />
          <span className="text-xs text-muted-foreground hidden sm:inline">
            {label[state]}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="end">
        {state === "unreachable" ? (
          <p>Cannot reach Cognition server</p>
        ) : health ? (
          <div className="space-y-1 text-xs">
            <p className="font-medium">Cognition {health.version}</p>
            <p>Active sessions: {health.active_sessions}</p>
            {(health.circuit_breakers ?? []).length > 0 && (
              <p>
                Providers:{" "}
                {(health.circuit_breakers ?? [])
                  .map((cb) => `${cb.provider} (${cb.state})`)
                  .join(", ")}
              </p>
            )}
          </div>
        ) : (
          <p>Checking server health…</p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}