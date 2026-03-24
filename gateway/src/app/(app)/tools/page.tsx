"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageContent } from "@/components/layout/page-content";
import { Skeleton } from "@/components/ui/skeleton";
import { WrenchIcon, RefreshCwIcon, AlertTriangleIcon, CheckCircleIcon } from "lucide-react";
import type { ToolInfo, ToolError } from "@/types/cognition";

export default function ToolsPage() {
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [errors, setErrors] = useState<ToolError[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [reloadResult, setReloadResult] = useState<"ok" | "fail" | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchTools = useCallback(async () => {
    setFetchError(null);
    try {
      const [toolsRes, errorsRes] = await Promise.all([
        fetch("/api/c/tools"),
        fetch("/api/c/tools/errors"),
      ]);
      if (!toolsRes.ok) throw new Error(`Tools fetch failed: ${toolsRes.status}`);
      const toolsData = await toolsRes.json();
      setTools(toolsData.tools ?? []);

      if (errorsRes.ok) {
        const errorsData = await errorsRes.json();
        setErrors(errorsData.errors ?? []);
      } else {
        setErrors([]);
      }
    } catch (e: unknown) {
      setFetchError(e instanceof Error ? e.message : "Failed to load tools");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTools();
  }, [fetchTools]);

  const handleReload = useCallback(async () => {
    setReloading(true);
    setReloadResult(null);
    try {
      const res = await fetch("/api/c/tools/reload", { method: "POST" });
      setReloadResult(res.ok ? "ok" : "fail");
      if (res.ok) {
        // Re-fetch after reload
        await fetchTools();
      }
    } catch {
      setReloadResult("fail");
    } finally {
      setReloading(false);
    }
  }, [fetchTools]);

  return (
    <PageContent contentClassName="max-w-4xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Tools</h1>
          <p className="text-muted-foreground mt-1">
            Tools registered on the connected Cognition server
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {reloadResult === "ok" && (
            <div className="flex items-center gap-1 text-sm text-emerald-600">
              <CheckCircleIcon className="h-4 w-4" />
              Reloaded
            </div>
          )}
          {reloadResult === "fail" && (
            <div className="flex items-center gap-1 text-sm text-destructive">
              <AlertTriangleIcon className="h-4 w-4" />
              Reload failed
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleReload}
            disabled={reloading || loading}
          >
            <RefreshCwIcon className={`h-4 w-4 mr-2 ${reloading ? "animate-spin" : ""}`} />
            Reload tools
          </Button>
        </div>
      </div>

      {errors.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 space-y-2 dark:bg-amber-950/20 dark:border-amber-800">
          <div className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-400">
            <AlertTriangleIcon className="h-4 w-4" />
            {errors.length} tool error{errors.length !== 1 ? "s" : ""}
          </div>
          {errors.map((err) => (
            <div key={err.tool} className="text-xs text-amber-700 dark:text-amber-500">
              <span className="font-mono font-medium">{err.tool}</span>: {err.error}
            </div>
          ))}
        </div>
      )}

      {loading && (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      )}

      {fetchError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {fetchError}
        </div>
      )}

      {!loading && !fetchError && tools.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
          <WrenchIcon className="h-10 w-10 opacity-30" />
          <p>No tools registered</p>
        </div>
      )}

      {!loading && !fetchError && tools.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {tools.map((tool) => (
            <ToolCard key={tool.name} tool={tool} />
          ))}
        </div>
      )}
    </PageContent>
  );
}

function ToolCard({ tool }: { tool: ToolInfo }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm font-mono">{tool.name}</CardTitle>
          {tool.source && (
            <Badge variant="outline" className="text-xs shrink-0">
              {tool.source}
            </Badge>
          )}
        </div>
        {tool.description && (
          <CardDescription className="text-xs line-clamp-2">
            {tool.description}
          </CardDescription>
        )}
      </CardHeader>
      {tool.module && (
        <CardContent>
          <p className="text-xs text-muted-foreground font-mono truncate">{tool.module}</p>
        </CardContent>
      )}
    </Card>
  );
}
