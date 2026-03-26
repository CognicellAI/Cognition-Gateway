"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { PageContent } from "@/components/layout/page-content";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

interface WorkspaceBindingSummary {
  id: string;
  scopeKey: string;
  scopeType: string;
}

interface RuntimeBinding {
  id: string;
  runtimeType: string;
  connectionConfig: string;
  lifecyclePolicy: string;
  executionPolicy: string;
  capabilities: string;
  enabled: boolean;
  workspaceBinding: WorkspaceBindingSummary;
}

interface RuntimeBindingFormState {
  workspaceBindingId: string;
  runtimeType: "docker_compose" | "kubernetes" | "http_only" | "shell" | "custom";
  connectionConfig: string;
  lifecyclePolicy: string;
  executionPolicy: string;
  capabilities: string;
  enabled: boolean;
}

const EMPTY_RUNTIME_BINDING: RuntimeBindingFormState = {
  workspaceBindingId: "",
  runtimeType: "docker_compose",
  connectionConfig: '{\n  "composeFile": "docker-compose.dev.yml",\n  "services": ["gateway", "cognition"]\n}',
  lifecyclePolicy: '{\n  "mode": "user_managed"\n}',
  executionPolicy: '{\n  "allowMutatingActions": false\n}',
  capabilities: '["healthcheck", "logs", "restart"]',
  enabled: true,
};

function prettifyJson(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

export default function RuntimeBindingsPage() {
  const [workspaceBindings, setWorkspaceBindings] = useState<WorkspaceBindingSummary[]>([]);
  const [runtimeBindings, setRuntimeBindings] = useState<RuntimeBinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<RuntimeBindingFormState>(EMPTY_RUNTIME_BINDING);

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);

    Promise.all([
      fetch("/api/workspace-bindings").then((response) => {
        if (!response.ok) throw new Error(`Workspace bindings request failed: ${response.status}`);
        return response.json();
      }),
      fetch("/api/runtime-bindings").then((response) => {
        if (!response.ok) throw new Error(`Runtime bindings request failed: ${response.status}`);
        return response.json();
      }),
    ])
      .then(([workspacePayload, runtimePayload]) => {
        setWorkspaceBindings(workspacePayload.workspaceBindings ?? []);
        setRuntimeBindings(runtimePayload.runtimeBindings ?? []);
      })
      .catch((fetchError: unknown) => {
        setError(fetchError instanceof Error ? fetchError.message : "Failed to load runtime bindings");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const workspaceBindingOptions = useMemo(
    () => workspaceBindings.map((binding) => ({ value: binding.id, label: `${binding.scopeType}: ${binding.scopeKey}` })),
    [workspaceBindings],
  );

  async function handleSave(): Promise<void> {
    setSaving(true);
    setError(null);

    try {
      const connectionConfig = JSON.parse(form.connectionConfig);
      const lifecyclePolicy = JSON.parse(form.lifecyclePolicy);
      const executionPolicy = JSON.parse(form.executionPolicy);
      const capabilities = JSON.parse(form.capabilities) as string[];

      const response = await fetch(editingId ? `/api/runtime-bindings/${editingId}` : "/api/runtime-bindings", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceBindingId: form.workspaceBindingId,
          runtimeType: form.runtimeType,
          connectionConfig,
          lifecyclePolicy,
          executionPolicy,
          capabilities,
          enabled: form.enabled,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? `Request failed: ${response.status}`);
      }

      setDialogOpen(false);
      setEditingId(null);
      setForm(EMPTY_RUNTIME_BINDING);
      fetchData();
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save runtime binding");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string): Promise<void> {
    setDeletingId(id);
    setError(null);

    try {
      const response = await fetch(`/api/runtime-bindings/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? `Request failed: ${response.status}`);
      }
      fetchData();
    } catch (deleteError: unknown) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete runtime binding");
    } finally {
      setDeletingId(null);
    }
  }

  function openCreateDialog(): void {
    setEditingId(null);
    setForm({
      ...EMPTY_RUNTIME_BINDING,
      workspaceBindingId: workspaceBindings[0]?.id ?? "",
    });
    setDialogOpen(true);
  }

  function openEditDialog(binding: RuntimeBinding): void {
    setEditingId(binding.id);
    setForm({
      workspaceBindingId: binding.workspaceBinding.id,
      runtimeType: binding.runtimeType as RuntimeBindingFormState["runtimeType"],
      connectionConfig: prettifyJson(binding.connectionConfig),
      lifecyclePolicy: prettifyJson(binding.lifecyclePolicy),
      executionPolicy: prettifyJson(binding.executionPolicy),
      capabilities: prettifyJson(binding.capabilities),
      enabled: binding.enabled,
    });
    setDialogOpen(true);
  }

  return (
    <PageContent contentClassName="max-w-6xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Runtime Bindings</h1>
          <p className="mt-1 text-muted-foreground">
            Describe how a bound execution environment is reached, managed, and constrained for a workspace binding.
          </p>
        </div>
        <Button onClick={openCreateDialog} disabled={workspaceBindings.length === 0}>New runtime binding</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Capability-driven runtime bindings</CardTitle>
          <CardDescription>
            Runtime bindings describe local runtime hints and safety policy for a workspace. Gateway records the environment shape here, while the agent uses local repo files, tools, and shell access to actually operate against it.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          This model is intentionally broader than Docker Compose. It should remain usable for future Kubernetes-backed environments and for integrations beyond GitHub.
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {!loading && workspaceBindings.length === 0 && (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          Create a workspace binding first before defining runtime bindings.
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-36 rounded-lg" />
          ))}
        </div>
      )}

      {!loading && runtimeBindings.length === 0 && workspaceBindings.length > 0 && (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          No runtime bindings yet. Add a runtime adapter like Docker Compose or Kubernetes for one of your workspace bindings.
        </div>
      )}

      {!loading && runtimeBindings.length > 0 && (
        <div className="space-y-3">
          {runtimeBindings.map((binding) => (
            <Card key={binding.id}>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">{binding.workspaceBinding.scopeKey}</CardTitle>
                  <Badge variant="outline">{binding.runtimeType}</Badge>
                  <Badge variant={binding.enabled ? "secondary" : "outline"}>{binding.enabled ? "Enabled" : "Disabled"}</Badge>
                </div>
                <CardDescription>{binding.workspaceBinding.scopeType}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <div className="grid gap-3 md:grid-cols-3">
                  <JsonPreview title="Connection config" value={binding.connectionConfig} />
                  <JsonPreview title="Lifecycle policy" value={binding.lifecyclePolicy} />
                  <JsonPreview title="Execution policy" value={binding.executionPolicy} />
                </div>
                <p>
                  Capabilities: <span className="font-mono text-foreground">{prettifyJson(binding.capabilities)}</span>
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <Button variant="outline" size="sm" onClick={() => openEditDialog(binding)}>Edit</Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive"
                    onClick={() => handleDelete(binding.id)}
                    disabled={deletingId === binding.id}
                  >
                    {deletingId === binding.id ? "Deleting..." : "Delete"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit runtime binding" : "New runtime binding"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="workspace-binding-id">Workspace binding</Label>
                <select
                  id="workspace-binding-id"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={form.workspaceBindingId}
                  onChange={(event) => setForm((current) => ({ ...current, workspaceBindingId: event.target.value }))}
                >
                  {workspaceBindingOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="runtime-type">Runtime type</Label>
                <select
                  id="runtime-type"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={form.runtimeType}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    runtimeType: event.target.value as RuntimeBindingFormState["runtimeType"],
                  }))}
                >
                  <option value="docker_compose">docker_compose</option>
                  <option value="kubernetes">kubernetes</option>
                  <option value="http_only">http_only</option>
                  <option value="shell">shell</option>
                  <option value="custom">custom</option>
                </select>
              </div>
            </div>

            <JsonField
              id="connection-config"
              label="Connection config"
              value={form.connectionConfig}
              onChange={(value) => setForm((current) => ({ ...current, connectionConfig: value }))}
            />

            <div className="grid gap-4 lg:grid-cols-2">
              <JsonField
                id="lifecycle-policy"
                label="Lifecycle policy"
                value={form.lifecyclePolicy}
                onChange={(value) => setForm((current) => ({ ...current, lifecyclePolicy: value }))}
              />
              <JsonField
                id="execution-policy"
                label="Execution policy"
                value={form.executionPolicy}
                onChange={(value) => setForm((current) => ({ ...current, executionPolicy: value }))}
              />
            </div>

            <JsonField
              id="capabilities"
              label="Capabilities"
              value={form.capabilities}
              onChange={(value) => setForm((current) => ({ ...current, capabilities: value }))}
              rows={4}
            />

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Enabled</p>
                <p className="text-xs text-muted-foreground">Disabled runtime bindings stay visible but won’t be used for orchestration decisions.</p>
              </div>
              <input
                aria-label="Enabled"
                type="checkbox"
                checked={form.enabled}
                onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setDialogOpen(false);
              setEditingId(null);
              setForm(EMPTY_RUNTIME_BINDING);
            }}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : editingId ? "Save changes" : "Create binding"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContent>
  );
}

function JsonField({
  id,
  label,
  value,
  onChange,
  rows = 6,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Textarea id={id} rows={rows} value={value} onChange={(event) => onChange(event.target.value)} className="font-mono text-xs" />
    </div>
  );
}

function JsonPreview({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      <pre className="mt-2 whitespace-pre-wrap break-all text-xs text-foreground">{prettifyJson(value)}</pre>
    </div>
  );
}
