"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sidebar } from "@/components/layout/sidebar";
import { ServerHealthIndicator } from "@/components/layout/server-health-indicator";
import { useChatStore } from "@/hooks/use-chat-store";
import type { SessionSummary } from "@/types/cognition";
import { Button } from "@/components/ui/button";
import { BellIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface AppShellProps {
  children: React.ReactNode;
  role: string;
}

interface WsNotification {
  id: string;
  message: string;
  type: "success" | "error" | "info";
  at: number;
  href?: string;
}

const WS_EVENT_LABELS: Record<string, (payload: Record<string, unknown>) => string> = {
  "cron.run.complete": (p) => `Cron job finished: ${String(p.jobName ?? p.jobId ?? "unknown")}`,
  "cron.run.failed": (p) => `Cron job failed: ${String(p.jobName ?? p.jobId ?? "unknown")}`,
  "webhook.invoked": (p) => `Webhook triggered: ${String(p.path ?? p.webhookId ?? "unknown")}`,
};

function getNotificationHref(payload: Record<string, unknown>): string | undefined {
  const sessionId = payload.sessionId;
  if (typeof sessionId === "string" && sessionId.length > 0) {
    return `/chat/${sessionId}`;
  }

  const webhookId = payload.webhookId;
  if (typeof webhookId === "string" && webhookId.length > 0) {
    return "/webhooks";
  }

  const cronJobId = payload.cronJobId;
  if (typeof cronJobId === "string" && cronJobId.length > 0) {
    return "/cron";
  }

  return undefined;
}

export function AppShell({ children, role }: AppShellProps) {
  const router = useRouter();
  const { setSessions, removeSession, updateSession } = useChatStore();
  const [loading, setLoading] = useState(true);
  const [sessions, setLocalSessions] = useState<SessionSummary[]>([]);

  // ── WebSocket notification bell ───────────────────────────────────────────
  const wsRef = useRef<WebSocket | null>(null);
  const [notifications, setNotifications] = useState<WsNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [bellOpen, setBellOpen] = useState(false);

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${protocol}://${window.location.host}/ws`);
    wsRef.current = ws;

    ws.addEventListener("message", (evt) => {
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(evt.data as string) as Record<string, unknown>;
      } catch {
        return;
      }

      const type = data.type as string | undefined;
      if (!type) return;

      const label = WS_EVENT_LABELS[type];
      if (!label) return;

      const isError = type.endsWith(".failed") || type.endsWith(".error");
      const notification: WsNotification = {
        id: `${Date.now()}-${Math.random()}`,
        message: label(data),
        type: isError ? "error" : "success",
        at: Date.now(),
        href: getNotificationHref(data),
      };

      setNotifications((prev) => [notification, ...prev].slice(0, 50));
      setUnread((n) => n + 1);
    });

    return () => {
      ws.close();
    };
  }, []);

  function handleBellOpen(open: boolean) {
    setBellOpen(open);
    if (open) setUnread(0);
  }

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/c/sessions");
      if (!res.ok) return;
      const data = await res.json();
      setLocalSessions(data.sessions ?? []);
      setSessions(data.sessions ?? []);
    } finally {
      setLoading(false);
    }
  }, [setSessions]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const handleNewChat = useCallback(async () => {
    try {
      const res = await fetch("/api/c/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: null }),
      });
      if (!res.ok) return;
      const session: SessionSummary = await res.json();
      setLocalSessions((prev) => [session, ...prev]);
      setSessions([session, ...sessions]);
      router.push(`/chat/${session.id}`);
    } catch {
      // Could surface toast here
    }
  }, [router, sessions, setSessions]);

  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      try {
        await fetch(`/api/c/sessions/${sessionId}`, { method: "DELETE" });
        setLocalSessions((prev) => prev.filter((s) => s.id !== sessionId));
        removeSession(sessionId);
        router.push("/chat");
      } catch {
        // Could surface toast here
      }
    },
    [router, removeSession]
  );

  const handleRenameSession = useCallback(
    async (sessionId: string, title: string) => {
      try {
        const res = await fetch(`/api/c/sessions/${sessionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        });
        if (res.ok) {
          const updated = await res.json() as SessionSummary;
          setLocalSessions((prev) =>
            prev.map((s) => (s.id === sessionId ? { ...s, title: updated.title } : s))
          );
          updateSession(updated);
        }
      } catch {
        // Best-effort
      }
    },
    [updateSession]
  );

  return (
    <TooltipProvider>
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar
          sessions={sessions}
          loading={loading}
          onNewChat={handleNewChat}
          onDeleteSession={handleDeleteSession}
          onRenameSession={handleRenameSession}
          isAdmin={role === "admin"}
        />
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Header */}
          <header className="flex h-14 items-center justify-end gap-2 border-b px-4 shrink-0">
            {/* Notification Bell */}
            <DropdownMenu open={bellOpen} onOpenChange={handleBellOpen}>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative h-8 w-8">
                  <BellIcon className="h-4 w-4" />
                  {unread > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
                      {unread > 9 ? "9+" : unread}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80 p-0">
                <div className="border-b px-4 py-2.5">
                  <p className="text-sm font-medium">Notifications</p>
                </div>
                {notifications.length === 0 ? (
                  <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                    No notifications yet
                  </div>
                ) : (
                  <div className="max-h-72 overflow-y-auto divide-y">
                    {notifications.map((n) => {
                      const content = (
                        <>
                          <p className={n.type === "error" ? "text-destructive" : ""}>{n.message}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {new Date(n.at).toLocaleTimeString()}
                          </p>
                        </>
                      );

                      return (
                        <div key={n.id} className="px-4 py-2.5 text-sm">
                          {n.href ? (
                            <button
                              type="button"
                              className="w-full text-left rounded-sm hover:bg-accent/50 focus:outline-none focus:ring-2 focus:ring-ring"
                              onClick={() => {
                                setBellOpen(false);
                                router.push(n.href!);
                              }}
                            >
                              {content}
                            </button>
                          ) : (
                            content
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <ServerHealthIndicator />
          </header>
          {/* Main content */}
          <main className="flex-1 min-h-0 overflow-hidden">{children}</main>
        </div>
      </div>
    </TooltipProvider>
  );
}
