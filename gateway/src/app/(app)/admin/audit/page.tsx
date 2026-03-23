"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DownloadIcon, RefreshCwIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

interface AuditLogEntry {
  id: string;
  userId: string | null;
  userEmail: string | null;
  action: string;
  resource: string | null;
  details: string | null;
  ip: string | null;
  createdAt: string;
}

const ACTION_COLORS: Record<string, string> = {
  "session.create": "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  "session.delete": "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  "config.patch": "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  "config.rollback": "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  "cron.create": "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  "cron.update": "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  "cron.delete": "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  "webhook.create": "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  "webhook.delete": "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  "user.create": "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  "user.role_change": "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  "apikey.create": "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400",
  "apikey.delete": "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

function actionBadgeClass(action: string): string {
  return ACTION_COLORS[action] ?? "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400";
}

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filterAction, setFilterAction] = useState("__all__");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  const buildQuery = useCallback(
    (p: number) => {
      const params = new URLSearchParams();
      params.set("page", String(p));
      params.set("limit", "50");
      if (filterAction && filterAction !== "__all__") params.set("action", filterAction);
      if (filterFrom) params.set("from", new Date(filterFrom).toISOString());
      if (filterTo) params.set("to", new Date(filterTo + "T23:59:59").toISOString());
      return params.toString();
    },
    [filterAction, filterFrom, filterTo],
  );

  const fetchLogs = useCallback(
    (p: number) => {
      setLoading(true);
      fetch(`/api/admin/audit?${buildQuery(p)}`)
        .then((r) => {
          if (!r.ok) throw new Error(`Server responded ${r.status}`);
          return r.json();
        })
        .then((d) => {
          setLogs(d.logs ?? []);
          setTotal(d.total ?? 0);
          setPages(d.pages ?? 1);
          setPage(p);
        })
        .catch((e: unknown) =>
          setError(e instanceof Error ? e.message : "Failed to load audit log"),
        )
        .finally(() => setLoading(false));
    },
    [buildQuery],
  );

  useEffect(() => {
    fetchLogs(1);
  }, [fetchLogs]);

  function handleSearch() {
    fetchLogs(1);
  }

  function handleExportCsv() {
    const params = new URLSearchParams();
    params.set("limit", "200");
    params.set("format", "csv");
    if (filterAction) params.set("action", filterAction);
    if (filterFrom) params.set("from", new Date(filterFrom).toISOString());
    if (filterTo) params.set("to", new Date(filterTo + "T23:59:59").toISOString());
    window.open(`/api/admin/audit?${params.toString()}`, "_blank");
  }

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Audit Log</h1>
          <p className="text-muted-foreground mt-1">
            {total > 0 ? `${total} events recorded` : "Gateway activity log"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => fetchLogs(page)}>
            <RefreshCwIcon className="h-3.5 w-3.5 mr-1.5" />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCsv}>
            <DownloadIcon className="h-3.5 w-3.5 mr-1.5" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-end">
        <div className="space-y-1">
          <Label className="text-xs">Action prefix</Label>
          <Select
            value={filterAction}
            onValueChange={v => setFilterAction(v)}
          >
            <SelectTrigger className="w-44 h-8 text-xs">
              <SelectValue placeholder="All actions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All actions</SelectItem>
              <SelectItem value="session">session.*</SelectItem>
              <SelectItem value="config">config.*</SelectItem>
              <SelectItem value="cron">cron.*</SelectItem>
              <SelectItem value="webhook">webhook.*</SelectItem>
              <SelectItem value="user">user.*</SelectItem>
              <SelectItem value="apikey">apikey.*</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">From</Label>
          <Input
            type="date"
            value={filterFrom}
            onChange={(e) => setFilterFrom(e.target.value)}
            className="h-8 text-xs w-36"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">To</Label>
          <Input
            type="date"
            value={filterTo}
            onChange={(e) => setFilterTo(e.target.value)}
            className="h-8 text-xs w-36"
          />
        </div>
        <Button size="sm" onClick={handleSearch} className="h-8">
          Search
        </Button>
      </div>

      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 rounded" />
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {!loading && !error && logs.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
          <p>No audit log entries found</p>
        </div>
      )}

      {!loading && !error && logs.length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground w-36">Time</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Action</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">User</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Resource</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Details</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground w-28">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-muted/30">
                  <td className="px-3 py-2 text-muted-foreground whitespace-nowrap font-mono">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${actionBadgeClass(log.action)}`}
                    >
                      {log.action}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {log.userEmail ?? log.userId ?? <span className="opacity-40">—</span>}
                  </td>
                  <td className="px-3 py-2 font-mono text-muted-foreground truncate max-w-28">
                    {log.resource ?? <span className="opacity-40">—</span>}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground truncate max-w-48">
                    {log.details ? (
                      <span title={log.details}>{summariseDetails(log.details)}</span>
                    ) : (
                      <span className="opacity-40">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">
                    {log.ip ?? <span className="opacity-40">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Page {page} of {pages} ({total} total)
          </span>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={page <= 1}
              onClick={() => fetchLogs(page - 1)}
            >
              <ChevronLeftIcon className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={page >= pages}
              onClick={() => fetchLogs(page + 1)}
            >
              <ChevronRightIcon className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function summariseDetails(json: string): string {
  try {
    const obj = JSON.parse(json) as Record<string, unknown>;
    return Object.entries(obj)
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join(", ");
  } catch {
    return json;
  }
}
