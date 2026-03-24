"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageContent } from "@/components/layout/page-content";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircleIcon, Clock3Icon, RefreshCwIcon, XCircleIcon } from "lucide-react";

interface DispatchRun {
  id: string;
  sourceType: string;
  sourceId: string;
  status: string;
  sessionId: string | null;
  renderedPrompt: string | null;
  output: string | null;
  tokenUsage: number | null;
  error: string | null;
  metadata: string | null;
  contextKey: string | null;
  approvalRequired: boolean;
  approvalReason: string | null;
  startedAt: string;
  finishedAt: string | null;
}

function parseMetadata(value: string | null): Record<string, unknown> | null {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function StatusIcon({ status }: { status: string }) {
  if (status === "success") {
    return <CheckCircleIcon className="h-4 w-4 text-green-600" />;
  }
  if (status === "error" || status === "rejected") {
    return <XCircleIcon className="h-4 w-4 text-destructive" />;
  }
  return <Clock3Icon className="h-4 w-4 text-amber-600" />;
}

export default function ActivityPage() {
  const [runs, setRuns] = useState<DispatchRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sourceType, setSourceType] = useState("all");
  const [status, setStatus] = useState("all");

  const fetchRuns = useCallback(() => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    params.set("sourceType", sourceType);
    params.set("status", status);

    fetch(`/api/activity?${params.toString()}`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Server responded ${response.status}`);
        }
        return response.json();
      })
      .then((data) => setRuns(data.runs ?? []))
      .catch((fetchError: unknown) => {
        setError(fetchError instanceof Error ? fetchError.message : "Failed to load activity");
      })
      .finally(() => setLoading(false));
  }, [sourceType, status]);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  return (
    <PageContent contentClassName="max-w-6xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Activity Feed</h1>
          <p className="mt-1 text-muted-foreground">Unified run history across cron and webhooks</p>
        </div>
        <Button variant="outline" onClick={fetchRuns}>
          <RefreshCwIcon className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <Select value={sourceType} onValueChange={setSourceType}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Source type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            <SelectItem value="cron">Cron</SelectItem>
            <SelectItem value="webhook">Webhook</SelectItem>
          </SelectContent>
        </Select>

        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="running">Running</SelectItem>
            <SelectItem value="success">Success</SelectItem>
            <SelectItem value="error">Error</SelectItem>
            <SelectItem value="awaiting_approval">Awaiting approval</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-32 rounded-lg" />
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {!loading && !error && runs.length === 0 && (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          No dispatch runs found for the selected filters.
        </div>
      )}

      {!loading && !error && runs.length > 0 && (
        <div className="space-y-4">
          {runs.map((run) => {
            const metadata = parseMetadata(run.metadata);

            return (
              <Card key={run.id}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <StatusIcon status={run.status} />
                        <CardTitle className="text-base capitalize">{run.sourceType} run</CardTitle>
                        <Badge variant="outline">{run.status}</Badge>
                        {run.approvalRequired && <Badge>approval required</Badge>}
                      </div>
                      <CardDescription className="mt-1">
                        Started {new Date(run.startedAt).toLocaleString()}
                      </CardDescription>
                    </div>
                    {run.sessionId && (
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/chat/${run.sessionId}`}>Open session</Link>
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex flex-wrap gap-4 text-muted-foreground">
                    <span>Source ID: <span className="font-mono text-foreground">{run.sourceId}</span></span>
                    {run.contextKey && (
                      <span>Context: <span className="font-mono text-foreground">{run.contextKey}</span></span>
                    )}
                    {typeof run.tokenUsage === "number" && <span>{run.tokenUsage.toLocaleString()} tokens</span>}
                  </div>

                  {metadata && (
                    <div className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
                      <pre className="whitespace-pre-wrap break-words">{JSON.stringify(metadata, null, 2)}</pre>
                    </div>
                  )}

                  {run.renderedPrompt && (
                    <div>
                      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Prompt</p>
                      <p className="line-clamp-4 whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-sm">
                        {run.renderedPrompt}
                      </p>
                    </div>
                  )}

                  {run.output && (
                    <div>
                      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Output</p>
                      <p className="line-clamp-5 whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-sm text-foreground">
                        {run.output}
                      </p>
                    </div>
                  )}

                  {run.error && (
                    <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                      {run.error}
                    </div>
                  )}

                  {run.approvalReason && (
                    <p className="text-xs text-muted-foreground">Approval reason: {run.approvalReason}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </PageContent>
  );
}
