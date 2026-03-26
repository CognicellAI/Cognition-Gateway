"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageContent } from "@/components/layout/page-content";
import { Skeleton } from "@/components/ui/skeleton";

interface ApprovalRun {
  id: string;
  sourceType: string;
  sourceId: string;
  status: string;
   runIntent: string | null;
   resourceType: string | null;
   workspaceScopeKey: string | null;
  renderedPrompt: string | null;
  approvalReason: string | null;
  contextKey: string | null;
  startedAt: string;
}

export default function ApprovalsPage() {
  const [runs, setRuns] = useState<ApprovalRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  const fetchRuns = useCallback(() => {
    setLoading(true);
    setError(null);

    fetch("/api/approvals")
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Server responded ${response.status}`);
        }
        return response.json();
      })
      .then((data) => setRuns(data.runs ?? []))
      .catch((fetchError: unknown) => {
        setError(fetchError instanceof Error ? fetchError.message : "Failed to load approvals");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  async function act(runId: string, action: "approve" | "reject") {
    setActingId(runId);
    try {
      const response = await fetch("/api/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId, action }),
      });

      if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
      }

      fetchRuns();
    } catch (actionError: unknown) {
      setError(actionError instanceof Error ? actionError.message : "Failed to update approval");
    } finally {
      setActingId(null);
    }
  }

  return (
    <PageContent contentClassName="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Approvals</h1>
        <p className="mt-1 text-muted-foreground">Runs waiting for Gateway approval before execution continues</p>
      </div>

      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-40 rounded-lg" />
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
          No runs are awaiting approval.
        </div>
      )}

      {!loading && !error && runs.length > 0 && (
        <div className="space-y-4">
          {runs.map((run) => (
            <Card key={run.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base capitalize">{run.sourceType} approval</CardTitle>
                      <Badge>awaiting approval</Badge>
                      {run.resourceType && <Badge variant="outline">{run.resourceType}</Badge>}
                      {run.runIntent && <Badge variant="secondary">{run.runIntent}</Badge>}
                    </div>
                    <CardDescription className="mt-1">
                      Source ID {run.sourceId} · {new Date(run.startedAt).toLocaleString()}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {run.approvalReason && (
                  <p className="text-sm text-muted-foreground">Reason: {run.approvalReason}</p>
                )}
                {run.contextKey && (
                  <p className="text-xs text-muted-foreground">Context: <span className="font-mono text-foreground">{run.contextKey}</span></p>
                )}
                {run.workspaceScopeKey && (
                  <p className="text-xs text-muted-foreground">Workspace scope: <span className="font-mono text-foreground">{run.workspaceScopeKey}</span></p>
                )}
                {run.renderedPrompt && (
                  <div className="rounded-md bg-muted/40 p-3 text-sm whitespace-pre-wrap">
                    {run.renderedPrompt}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button onClick={() => act(run.id, "approve")} disabled={actingId === run.id}>
                    Approve
                  </Button>
                  <Button variant="outline" onClick={() => act(run.id, "reject")} disabled={actingId === run.id}>
                    Reject
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </PageContent>
  );
}
