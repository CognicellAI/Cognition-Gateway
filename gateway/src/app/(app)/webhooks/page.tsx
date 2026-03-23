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
import { WebhookIcon, PlusIcon, TrashIcon, PencilIcon, CopyIcon, CheckCircleIcon, XCircleIcon, LoaderIcon } from "lucide-react";

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

interface Webhook {
  id: string;
  name: string;
  path: string;
  secret: string | null;
  agentName: string;
  promptTemplate: string;
  sessionMode: string;
  approvalMode: string;
  enabled: boolean;
  createdAt: string;
  dispatchRuns: DispatchRun[];
}

const EMPTY_FORM = {
  name: "",
  path: "",
  secret: "",
  agentName: "",
  promptTemplate: "{{body}}",
  sessionMode: "ephemeral" as "ephemeral" | "persistent",
  approvalMode: "none" as "none" | "always",
  enabled: true,
};

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<Webhook | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [expandedInvocations, setExpandedInvocations] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const fetchWebhooks = useCallback(() => {
    setLoading(true);
    fetch("/api/webhooks")
      .then((r) => {
        if (!r.ok) throw new Error(`Server responded ${r.status}`);
        return r.json();
      })
      .then((d) => setWebhooks(d.webhooks ?? []))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load webhooks"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchWebhooks();
  }, [fetchWebhooks]);

  function openCreate() {
    setEditingWebhook(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setDialogOpen(true);
  }

  function openEdit(webhook: Webhook) {
    setEditingWebhook(webhook);
    setForm({
      name: webhook.name,
      path: webhook.path,
      secret: webhook.secret ?? "",
      agentName: webhook.agentName,
      promptTemplate: webhook.promptTemplate,
      sessionMode: webhook.sessionMode as typeof EMPTY_FORM.sessionMode,
      approvalMode: webhook.approvalMode as typeof EMPTY_FORM.approvalMode,
      enabled: webhook.enabled,
    });
    setFormError(null);
    setDialogOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    setFormError(null);

    const payload = {
      ...form,
      secret: form.secret || undefined,
    };

    try {
      const url = editingWebhook ? `/api/webhooks/${editingWebhook.id}` : "/api/webhooks";
      const method = editingWebhook ? "PATCH" : "POST";
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
      fetchWebhooks();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/webhooks/${id}`, { method: "DELETE" });
    fetchWebhooks();
  }

  async function handleToggle(webhook: Webhook) {
    await fetch(`/api/webhooks/${webhook.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !webhook.enabled }),
    });
    fetchWebhooks();
  }

  function copyUrl(path: string, id: string) {
    const url = `${window.location.origin}/api/hooks/${path}`;
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  return (
    <div className="mx-auto max-w-4xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Webhooks</h1>
          <p className="text-muted-foreground mt-1">Register inbound webhooks that trigger agent sessions</p>
        </div>
        <Button onClick={openCreate}>
          <PlusIcon className="h-4 w-4 mr-2" />
          New webhook
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

      {!loading && !error && webhooks.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
          <WebhookIcon className="h-10 w-10 opacity-30" />
          <p>No webhooks yet</p>
          <p className="text-xs opacity-60">Create a webhook to trigger agents from external events</p>
        </div>
      )}

      {!loading && !error && webhooks.length > 0 && (
        <div className="space-y-3">
          {webhooks.map((wh) => (
            <WebhookCard
              key={wh.id}
              webhook={wh}
              expanded={expandedInvocations === wh.id}
              isCopied={copied === wh.id}
              onToggleInvocations={() =>
                setExpandedInvocations(expandedInvocations === wh.id ? null : wh.id)
              }
              onEdit={() => openEdit(wh)}
              onDelete={handleDelete}
              onToggle={() => handleToggle(wh)}
              onCopyUrl={() => copyUrl(wh.path, wh.id)}
            />
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingWebhook ? "Edit webhook" : "New webhook"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="wh-name">Name</Label>
              <Input
                id="wh-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="GitHub push events"
              />
            </div>

            {!editingWebhook && (
              <div className="space-y-1.5">
                <Label htmlFor="wh-path">Path</Label>
                <Input
                  id="wh-path"
                  value={form.path}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      path: e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, "-"),
                    }))
                  }
                  placeholder="github-push"
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Lowercase letters, numbers, hyphens, underscores.
                  URL will be <code>/api/hooks/{form.path || "..."}</code>
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="wh-secret">Secret (optional)</Label>
              <Input
                id="wh-secret"
                value={form.secret}
                onChange={(e) => setForm((f) => ({ ...f, secret: e.target.value }))}
                placeholder="Leave blank to skip signature validation"
                type="password"
              />
              <p className="text-xs text-muted-foreground">
                If set, validates <code>X-Hub-Signature-256</code> HMAC-SHA256 header
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="wh-agent">Agent name</Label>
              <Input
                id="wh-agent"
                value={form.agentName}
                onChange={(e) => setForm((f) => ({ ...f, agentName: e.target.value }))}
                placeholder="default"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="wh-prompt">Prompt template</Label>
              <Textarea
                id="wh-prompt"
                value={form.promptTemplate}
                onChange={(e) => setForm((f) => ({ ...f, promptTemplate: e.target.value }))}
                placeholder="Process this event: {{body}}"
                rows={4}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Use <code>{"{{body}}"}</code> for the full JSON payload, or <code>{"{{field}}"}</code> for top-level string fields.
              </p>
            </div>

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

            {formError && (
              <p className="text-sm text-destructive">{formError}</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : editingWebhook ? "Save changes" : "Create webhook"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function WebhookCard({
  webhook,
  expanded,
  isCopied,
  onToggleInvocations,
  onEdit,
  onDelete,
  onToggle,
  onCopyUrl,
}: {
  webhook: Webhook;
  expanded: boolean;
  isCopied: boolean;
  onToggleInvocations: () => void;
  onEdit: () => void;
  onDelete: (id: string) => void;
  onToggle: () => void;
  onCopyUrl: () => void;
}) {
  const latestInvocation = webhook.dispatchRuns[0];

  return (
    <Card className={webhook.enabled ? "" : "opacity-60"}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">{webhook.name}</CardTitle>
              <Badge variant={webhook.enabled ? "default" : "secondary"} className="text-xs">
                {webhook.enabled ? "enabled" : "disabled"}
              </Badge>
              {webhook.secret && (
                <Badge variant="outline" className="text-xs">signed</Badge>
              )}
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              <CardDescription className="text-xs font-mono">/api/hooks/{webhook.path}</CardDescription>
              <button
                className="text-muted-foreground hover:text-foreground ml-1"
                onClick={onCopyUrl}
                title="Copy URL"
              >
                {isCopied ? (
                  <CheckCircleIcon className="h-3 w-3 text-green-600" />
                ) : (
                  <CopyIcon className="h-3 w-3" />
                )}
              </button>
            </div>
          </div>
          <div className="flex gap-1 shrink-0">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onToggle}>
              <WebhookIcon className={`h-3.5 w-3.5 ${webhook.enabled ? "text-muted-foreground" : "text-green-600"}`} />
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
                  <AlertDialogTitle>Delete &quot;{webhook.name}&quot;?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete the webhook and all its invocation history.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => onDelete(webhook.id)}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-4 flex-wrap">
          <span>Agent: <span className="font-mono text-foreground">{webhook.agentName}</span></span>
          <span>Mode: {webhook.sessionMode}</span>
          <span>Approval: {webhook.approvalMode}</span>
        </div>

        {latestInvocation && (
          <div className="flex items-center gap-2">
            <RunStatusIcon status={latestInvocation.status} />
            <span>
              Last invocation: <span className="text-foreground">{latestInvocation.status}</span>
              {" — "}
              {new Date(latestInvocation.startedAt).toLocaleString()}
            </span>
            <button
              className="text-xs underline text-muted-foreground hover:text-foreground"
              onClick={onToggleInvocations}
            >
              {expanded ? "hide history" : "view history"}
            </button>
          </div>
        )}

        {!latestInvocation && (
          <p className="text-xs text-muted-foreground/60">No invocations yet</p>
        )}

        {expanded && webhook.dispatchRuns.length > 0 && (
          <div className="mt-2 border rounded-md divide-y text-xs">
            {webhook.dispatchRuns.map((inv) => (
              <div key={inv.id} className="flex items-start gap-2 p-2">
                <RunStatusIcon status={inv.status} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span>{new Date(inv.startedAt).toLocaleString()}</span>
                    {inv.sessionId && (
                      <span className="font-mono truncate max-w-24">{inv.sessionId}</span>
                    )}
                    {typeof inv.tokenUsage === "number" && (
                      <span>{inv.tokenUsage.toLocaleString()} tokens</span>
                    )}
                  </div>
                  {inv.output && (
                    <p className="mt-0.5 text-foreground whitespace-pre-wrap line-clamp-3">{inv.output}</p>
                  )}
                  {inv.error && (
                    <p className="mt-0.5 text-destructive">{inv.error}</p>
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
