"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ShieldCheckIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import type { AuditAction } from "@/lib/gateway/audit";

interface AuditLog {
  id: string;
  userId: string | null;
  userEmail: string | null;
  action: string;
  resource: string | null;
  details: string | null;
  ip: string | null;
  createdAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

const ACTION_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "All actions" },
  { value: "session.create", label: "session.create" },
  { value: "session.delete", label: "session.delete" },
  { value: "config.patch", label: "config.patch" },
  { value: "config.rollback", label: "config.rollback" },
  { value: "cron.create", label: "cron.create" },
  { value: "cron.update", label: "cron.update" },
  { value: "cron.delete", label: "cron.delete" },
  { value: "cron.run", label: "cron.run" },
  { value: "webhook.create", label: "webhook.create" },
  { value: "webhook.update", label: "webhook.update" },
  { value: "webhook.delete", label: "webhook.delete" },
  { value: "webhook.invoke", label: "webhook.invoke" },
  { value: "user.create", label: "user.create" },
  { value: "user.role_change", label: "user.role_change" },
  { value: "apikey.create", label: "apikey.create" },
  { value: "apikey.delete", label: "apikey.delete" },
  { value: "apikey.use", label: "apikey.use" },
];

const ACTION_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  "session.create": "default",
  "session.delete": "destructive",
  "config.patch": "default",
  "config.rollback": "secondary",
  "cron.create": "default",
  "cron.update": "secondary",
  "cron.delete": "destructive",
  "cron.run": "outline",
  "webhook.create": "default",
  "webhook.update": "secondary",
  "webhook.delete": "destructive",
  "webhook.invoke": "outline",
  "user.create": "default",
  "user.role_change": "destructive",
  "apikey.create": "default",
  "apikey.delete": "destructive",
  "apikey.use": "outline",
};

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filterAction, setFilterAction] = useState("");
  const [filterUserId, setFilterUserId] = useState("");
  const [filterResource, setFilterResource] = useState("");
  const [page, setPage] = useState(1);

  const fetchLogs = useCallback(() => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", "50");
    if (filterAction) params.set("action", filterAction);
    if (filterUserId.trim()) params.set("userId", filterUserId.trim());
    if (filterResource.trim()) params.set("resource", filterResource.trim());

    fetch(`/api/audit?${params.toString()}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Server responded ${r.status}`);
        return r.json();
      })
      .then((d: { logs: AuditLog[]; pagination: Pagination }) => {
        setLogs(d.logs ?? []);
        setPagination(d.pagination ?? null);
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Failed to load audit logs"),
      )
      .finally(() => setLoading(false));
  }, [page, filterAction, filterUserId, filterResource]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  function handleFilterSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    fetchLogs();
  }

  function handleResetFilters() {
    setFilterAction("");
    setFilterUserId("");
    setFilterResource("");
    setPage(1);
  }

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Audit Log</h1>
        <p className="text-muted-foreground mt-1">
          Activity trail for all significant Gateway actions
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleFilterSubmit} className="flex flex-wrap gap-4 items-end">
            <div className="space-y-1.5 min-w-[180px]">
              <Label>Action</Label>
              <Select
                value={filterAction}
                onValueChange={(v) => {
                  setFilterAction(v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All actions" />
                </SelectTrigger>
                <SelectContent>
                  {ACTION_OPTIONS.map((o) => (
                    <SelectItem key={o.value || "__all"} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="filter-user">User ID</Label>
              <Input
                id="filter-user"
                value={filterUserId}
                onChange={(e) => setFilterUserId(e.target.value)}
                placeholder="cuid..."
                className="w-52 font-mono text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="filter-resource">Resource ID</Label>
              <Input
                id="filter-resource"
                value={filterResource}
                onChange={(e) => setFilterResource(e.target.value)}
                placeholder="cuid..."
                className="w-52 font-mono text-xs"
              />
            </div>

            <div className="flex gap-2">
              <Button type="submit" size="sm">
                Apply
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleResetFilters}
              >
                Reset
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Results */}
      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
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
          <ShieldCheckIcon className="h-10 w-10 opacity-30" />
          <p>No audit log entries found</p>
          {(filterAction || filterUserId || filterResource) && (
            <p className="text-xs opacity-60">Try clearing the filters</p>
          )}
        </div>
      )}

      {!loading && !error && logs.length > 0 && (
        <>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">
                    Timestamp
                  </th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">
                    User
                  </th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">
                    Action
                  </th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">
                    Resource
                  </th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">
                    Details
                  </th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">
                    IP
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {logs.map((log) => (
                  <AuditRow key={log.id} log={log} />
                ))}
              </tbody>
            </table>
          </div>

          {pagination && pagination.pages > 1 && (
            <div className="flex items-center justify-between text-sm">
              <p className="text-muted-foreground">
                Showing {(pagination.page - 1) * pagination.limit + 1}–
                {Math.min(pagination.page * pagination.limit, pagination.total)} of{" "}
                {pagination.total} entries
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeftIcon className="h-4 w-4" />
                </Button>
                <span className="text-muted-foreground">
                  Page {pagination.page} of {pagination.pages}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={page >= pagination.pages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRightIcon className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AuditRow({ log }: { log: AuditLog }) {
  const variant = ACTION_VARIANT[log.action] ?? "outline";
  let detailText = "";
  if (log.details) {
    try {
      const parsed = JSON.parse(log.details) as Record<string, unknown>;
      detailText = Object.entries(parsed)
        .map(([k, v]) => `${k}: ${String(v)}`)
        .join(", ");
    } catch {
      detailText = log.details;
    }
  }

  return (
    <tr className="hover:bg-muted/30 transition-colors">
      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap font-mono">
        {new Date(log.createdAt).toLocaleString()}
      </td>
      <td className="px-4 py-3 text-xs max-w-[160px]">
        {log.userEmail ? (
          <span className="truncate block" title={log.userId ?? undefined}>
            {log.userEmail}
          </span>
        ) : (
          <span className="text-muted-foreground italic">system</span>
        )}
      </td>
      <td className="px-4 py-3">
        <Badge variant={variant} className="text-xs font-mono whitespace-nowrap">
          {log.action}
        </Badge>
      </td>
      <td className="px-4 py-3 text-xs font-mono text-muted-foreground max-w-[140px]">
        {log.resource ? (
          <span className="truncate block" title={log.resource}>
            {log.resource}
          </span>
        ) : (
          <span className="opacity-40">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground max-w-[220px]">
        {detailText ? (
          <span className="truncate block" title={detailText}>
            {detailText}
          </span>
        ) : (
          <span className="opacity-40">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-xs font-mono text-muted-foreground whitespace-nowrap">
        {log.ip ?? <span className="opacity-40">—</span>}
      </td>
    </tr>
  );
}
