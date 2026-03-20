"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BotIcon, PlusIcon, MessageSquareIcon, ArrowRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useChatStore } from "@/hooks/use-chat-store";
import type { SessionSummary } from "@/types/cognition";

export default function ChatIndexPage() {
  const router = useRouter();
  const { setSessions } = useChatStore();
  const [recentSessions, setRecentSessions] = useState<SessionSummary[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetch("/api/c/sessions?limit=8")
      .then((r) => r.ok ? r.json() : { sessions: [] })
      .then((d: { sessions: SessionSummary[] }) => setRecentSessions(d.sessions ?? []))
      .catch(() => undefined);
  }, []);

  const createSession = useCallback(async () => {
    if (creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/c/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: null }),
      });
      if (res.ok) {
        const session = await res.json() as SessionSummary;
        setSessions([session, ...recentSessions]);
        router.push(`/chat/${session.id}`);
      }
    } finally {
      setCreating(false);
    }
  }, [creating, recentSessions, setSessions, router]);

  return (
    <div className="flex h-full items-center justify-center">
      <div className="w-full max-w-lg px-6 space-y-8">
        {/* Hero */}
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <div className="rounded-2xl bg-muted p-4">
              <BotIcon className="h-10 w-10 text-muted-foreground" />
            </div>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Cognition Gateway</h1>
          <p className="text-sm text-muted-foreground">
            Start a new conversation or continue a recent session.
          </p>
        </div>

        {/* New session CTA */}
        <Button
          className="w-full gap-2 h-11 text-base"
          onClick={createSession}
          disabled={creating}
        >
          <PlusIcon className="h-5 w-5" />
          {creating ? "Starting…" : "New session"}
        </Button>

        {/* Recent sessions */}
        {recentSessions.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1">
              Recent
            </p>
            <div className="space-y-1">
              {recentSessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() => router.push(`/chat/${session.id}`)}
                  className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-accent transition-colors group"
                >
                  <MessageSquareIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate">
                    {session.title ?? "Untitled session"}
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatRelativeTime(session.updated_at)}
                  </span>
                  <ArrowRightIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
