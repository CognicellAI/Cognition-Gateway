"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { CalendarClockIcon, PlusIcon, TrashIcon, PencilIcon, PlayCircleIcon, CheckCircleIcon, XCircleIcon, LoaderIcon } from "lucide-react";

interface DispatchRun {
  id: string;
  status: "running" | "success" | "error";
  sessionId: string | null;
  output: string | null;
  tokenUsage: number | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

interface CronJob {
  id: string;
  name: string;
  schedule: string;
  agentName: string;
  prompt: string;
  sessionMode: string;
  deliveryMode: string;
  deliveryTarget: string | null;
  approvalMode: string;
  enabled: boolean;
  createdAt: string;
  dispatchRuns: DispatchRun[];
}

const EMPTY_FORM = {
  name: "",
  schedule: "",
  agentName: "",
  prompt: "",
  sessionMode: "ephemeral" as "ephemeral" | "persistent",
  deliveryMode: "none" as "none" | "webhook",
  deliveryTarget: "",
  approvalMode: "none" as "none" | "always",
  enabled: true,
};

export default function CronPage() {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<CronJob | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [expandedRuns, setExpandedRuns] = useState<string | null>(null);

  const fetchJobs = useCallback(() => {
    setLoading(true);
    fetch("/api/cron/jobs")
      .then((r) => {
        if (!r.ok) throw new Error(`Server responded ${r.status}`);
        return r.json();
      })
      .then((d) => setJobs(d.jobs ?? []))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load cron jobs"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  function openCreate() {
    setEditingJob(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setDialogOpen(true);
  }

  function openEdit(job: CronJob) {
    setEditingJob(job);
    setForm({
      name: job.name,
      schedule: job.schedule,
      agentName: job.agentName,
      prompt: job.prompt,
      sessionMode: job.sessionMode as typeof EMPTY_FORM.sessionMode,
      deliveryMode: job.deliveryMode as typeof EMPTY_FORM.deliveryMode,
      deliveryTarget: job.deliveryTarget ?? "",
      approvalMode: job.approvalMode as typeof EMPTY_FORM.approvalMode,
      enabled: job.enabled,
    });
    setFormError(null);
    setDialogOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    setFormError(null);

    const payload = {
      ...form,
      deliveryTarget: form.deliveryTarget || undefined,
    };

    try {
      const url = editingJob ? `/api/cron/jobs/${editingJob.id}` : "/api/cron/jobs";
      const method = editingJob ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? `Request failed: ${res.status}`);
      }
      setDialogOpen(false);
      fetchJobs();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/cron/jobs/${id}`, { method: "DELETE" });
    fetchJobs();
  }

  async function handleToggle(job: CronJob) {
    await fetch(`/api/cron/jobs/${job.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !job.enabled }),
    });
    fetchJobs();
  }

  return (
    <div className="mx-auto max-w-4xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Cron Jobs</h1>
          <p className="text-muted-foreground mt-1">Schedule recurring agent tasks</p>
        </div>
        <Button onClick={openCreate}>
          <PlusIcon className="h-4 w-4 mr-2" />
          New job
        </Button>
      </div>

      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {!loading && !error && jobs.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
          <CalendarClockIcon className="h-10 w-10 opacity-30" />
          <p>No cron jobs yet</p>
          <p className="text-xs opacity-60">Create a job to schedule recurring agent tasks</p>
        </div>
      )}

      {!loading && !error && jobs.length > 0 && (
        <div className="space-y-3">
          {jobs.map((job) => (
            <CronJobCard
              key={job.id}
              job={job}
              expanded={expandedRuns === job.id}
              onToggleRuns={() => setExpandedRuns(expandedRuns === job.id ? null : job.id)}
              onEdit={() => openEdit(job)}
              onDelete={handleDelete}
              onToggle={() => handleToggle(job)}
            />
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingJob ? "Edit cron job" : "New cron job"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="cron-name">Name</Label>
              <Input
                id="cron-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Daily report"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cron-schedule">Schedule (cron expression)</Label>
              <Input
                id="cron-schedule"
                value={form.schedule}
                onChange={(e) => setForm((f) => ({ ...f, schedule: e.target.value }))}
                placeholder="0 9 * * 1-5"
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Standard 5-field cron: minute hour day month weekday
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cron-agent">Agent name</Label>
              <Input
                id="cron-agent"
                value={form.agentName}
                onChange={(e) => setForm((f) => ({ ...f, agentName: e.target.value }))}
                placeholder="default"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cron-prompt">Prompt</Label>
              <Textarea
                id="cron-prompt"
                value={form.prompt}
                onChange={(e) => setForm((f) => ({ ...f, prompt: e.target.value }))}
                placeholder="Generate a daily summary of..."
                rows={4}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Session mode</Label>
                <Select
                  value={form.sessionMode}
                  onValueChange={(v) => setForm((f) => ({ ...f, sessionMode: v as typeof EMPTY_FORM.sessionMode }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ephemeral">Ephemeral</SelectItem>
                    <SelectItem value="persistent">Persistent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Approval</Label>
                <Select
                  value={form.approvalMode}
                  onValueChange={(v) => setForm((f) => ({ ...f, approvalMode: v as typeof EMPTY_FORM.approvalMode }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No approval</SelectItem>
                    <SelectItem value="always">Always require approval</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Delivery mode</Label>
                <Select
                  value={form.deliveryMode}
                  onValueChange={(v) => setForm((f) => ({ ...f, deliveryMode: v as typeof EMPTY_FORM.deliveryMode }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="webhook">Webhook</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {form.deliveryMode === "webhook" && (
              <div className="space-y-1.5">
                <Label htmlFor="cron-target">Delivery URL</Label>
                <Input
                  id="cron-target"
                  value={form.deliveryTarget}
                  onChange={(e) => setForm((f) => ({ ...f, deliveryTarget: e.target.value }))}
                  placeholder="https://example.com/webhook"
                />
              </div>
            )}

            {formError && (
              <p className="text-sm text-destructive">{formError}</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : editingJob ? "Save changes" : "Create job"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CronJobCard({
  job,
  expanded,
  onToggleRuns,
  onEdit,
  onDelete,
  onToggle,
}: {
  job: CronJob;
  expanded: boolean;
  onToggleRuns: () => void;
  onEdit: () => void;
  onDelete: (id: string) => void;
  onToggle: () => void;
}) {
  const latestRun = job.dispatchRuns[0];

  return (
    <Card className={job.enabled ? "" : "opacity-60"}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">{job.name}</CardTitle>
              <Badge variant={job.enabled ? "default" : "secondary"} className="text-xs">
                {job.enabled ? "enabled" : "disabled"}
              </Badge>
            </div>
            <CardDescription className="text-xs font-mono mt-0.5">{job.schedule}</CardDescription>
          </div>
          <div className="flex gap-1 shrink-0">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onToggle}>
              {job.enabled ? (
                <PlayCircleIcon className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <PlayCircleIcon className="h-3.5 w-3.5 text-green-600" />
              )}
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
              <PencilIcon className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <TrashIcon className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete &quot;{job.name}&quot;?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete the job and all its run history.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => onDelete(job.id)}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-4 flex-wrap">
          <span>Agent: <span className="font-mono text-foreground">{job.agentName}</span></span>
          <span>Mode: {job.sessionMode}</span>
          <span>Approval: {job.approvalMode}</span>
          {job.deliveryMode !== "none" && (
            <span>Delivery: {job.deliveryMode}</span>
          )}
        </div>
        <p className="line-clamp-2 text-xs italic opacity-60">{job.prompt}</p>

        {latestRun && (
          <div className="flex items-center gap-2">
            <RunStatusIcon status={latestRun.status} />
            <span>
              Last run: <span className="text-foreground">{latestRun.status}</span>
              {" — "}
              {new Date(latestRun.startedAt).toLocaleString()}
            </span>
            <button
              className="text-xs underline text-muted-foreground hover:text-foreground"
              onClick={onToggleRuns}
            >
              {expanded ? "hide history" : "view history"}
            </button>
          </div>
        )}

        {!latestRun && (
          <p className="text-xs text-muted-foreground/60">No runs yet</p>
        )}

        {expanded && job.dispatchRuns.length > 0 && (
          <div className="mt-2 border rounded-md divide-y text-xs">
            {job.dispatchRuns.map((run) => (
              <div key={run.id} className="flex items-start gap-2 p-2">
                <RunStatusIcon status={run.status} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span>{new Date(run.startedAt).toLocaleString()}</span>
                    {run.tokenUsage !== null && (
                      <span>{run.tokenUsage} tokens</span>
                    )}
                  </div>
                  {run.output && (
                    <p className="mt-0.5 line-clamp-2 text-foreground">{run.output}</p>
                  )}
                  {run.error && (
                    <p className="mt-0.5 text-destructive">{run.error}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RunStatusIcon({ status }: { status: string }) {
  if (status === "success") return <CheckCircleIcon className="h-3.5 w-3.5 text-green-600 shrink-0" />;
  if (status === "error") return <XCircleIcon className="h-3.5 w-3.5 text-destructive shrink-0" />;
  return <LoaderIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0 animate-spin" />;
}
