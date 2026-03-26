"use client";

import { useCallback, useEffect, useState } from "react";

import { PageContent } from "@/components/layout/page-content";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

interface WorkspaceBinding {
  id: string;
  scopeType: string;
  scopeKey: string;
  workspacePath: string;
  repoRoot: string | null;
  defaultBranch: string | null;
  envProfile: string | null;
  enabled: boolean;
}

interface WorkspaceBindingFormState {
  scopeType: string;
  scopeKey: string;
  workspacePath: string;
  repoRoot: string;
  defaultBranch: string;
  envProfile: string;
  enabled: boolean;
}

const EMPTY_WORKSPACE_BINDING: WorkspaceBindingFormState = {
  scopeType: "repo",
  scopeKey: "",
  workspacePath: "",
  repoRoot: "",
  defaultBranch: "main",
  envProfile: "dev",
  enabled: true,
};

export default function WorkspaceBindingsPage() {
  const [workspaceBindings, setWorkspaceBindings] = useState<WorkspaceBinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<WorkspaceBindingFormState>(EMPTY_WORKSPACE_BINDING);

  const fetchWorkspaceBindings = useCallback(() => {
    setLoading(true);
    setError(null);

    fetch("/api/workspace-bindings")
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Server responded ${response.status}`);
        }
        return response.json();
      })
      .then((payload) => setWorkspaceBindings(payload.workspaceBindings ?? []))
      .catch((fetchError: unknown) => {
        setError(fetchError instanceof Error ? fetchError.message : "Failed to load workspace bindings");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchWorkspaceBindings();
  }, [fetchWorkspaceBindings]);

  async function handleCreate(): Promise<void> {
    setSaving(true);
    setError(null);

    try {
      const response = await fetch(editingId ? `/api/workspace-bindings/${editingId}` : "/api/workspace-bindings", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          scopeType: form.scopeType.trim(),
          scopeKey: form.scopeKey.trim(),
          workspacePath: form.workspacePath.trim(),
          repoRoot: form.repoRoot.trim() || null,
          defaultBranch: form.defaultBranch.trim() || null,
          envProfile: form.envProfile.trim() || null,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? `Request failed: ${response.status}`);
      }

      setDialogOpen(false);
      setEditingId(null);
      setForm(EMPTY_WORKSPACE_BINDING);
      fetchWorkspaceBindings();
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save workspace binding");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string): Promise<void> {
    setDeletingId(id);
    setError(null);

    try {
      const response = await fetch(`/api/workspace-bindings/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? `Request failed: ${response.status}`);
      }

      fetchWorkspaceBindings();
    } catch (deleteError: unknown) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete workspace binding");
    } finally {
      setDeletingId(null);
    }
  }

  function openCreateDialog(): void {
    setEditingId(null);
    setForm(EMPTY_WORKSPACE_BINDING);
    setDialogOpen(true);
  }

  function openEditDialog(binding: WorkspaceBinding): void {
    setEditingId(binding.id);
    setForm({
      scopeType: binding.scopeType,
      scopeKey: binding.scopeKey,
      workspacePath: binding.workspacePath,
      repoRoot: binding.repoRoot ?? "",
      defaultBranch: binding.defaultBranch ?? "",
      envProfile: binding.envProfile ?? "",
      enabled: binding.enabled,
    });
    setDialogOpen(true);
  }

  return (
    <PageContent contentClassName="max-w-5xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Workspace Bindings</h1>
          <p className="mt-1 text-muted-foreground">
            Map external integration scopes like repositories or projects to local source workspaces.
          </p>
        </div>
        <Button onClick={openCreateDialog}>New workspace binding</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Why workspace bindings exist</CardTitle>
          <CardDescription>
            Workspace bindings tell Gateway where code lives for a scoped external resource. Runtime bindings and workflow recipes can build on top of this later.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Designed to stay integration-agnostic: the same model should work for GitHub repos, Jira projects, or custom vendor resource scopes without changing the core schema.
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-28 rounded-lg" />
          ))}
        </div>
      )}

      {!loading && workspaceBindings.length === 0 && (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          No workspace bindings yet. Start by mapping a repository or project scope to a local workspace path.
        </div>
      )}

      {!loading && workspaceBindings.length > 0 && (
        <div className="space-y-3">
          {workspaceBindings.map((binding) => (
            <Card key={binding.id}>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">{binding.scopeKey}</CardTitle>
                  <Badge variant="outline">{binding.scopeType}</Badge>
                  <Badge variant={binding.enabled ? "secondary" : "outline"}>
                    {binding.enabled ? "Enabled" : "Disabled"}
                  </Badge>
                </div>
                <CardDescription>{binding.workspacePath}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                {binding.repoRoot && <p>Repo root: <span className="font-mono text-foreground">{binding.repoRoot}</span></p>}
                {binding.defaultBranch && <p>Default branch: <span className="font-mono text-foreground">{binding.defaultBranch}</span></p>}
                {binding.envProfile && <p>Env profile: <span className="font-mono text-foreground">{binding.envProfile}</span></p>}
                <div className="flex items-center gap-2 pt-2">
                  <Button variant="outline" size="sm" onClick={() => openEditDialog(binding)}>
                    Edit
                  </Button>
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
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit workspace binding" : "New workspace binding"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="scope-type">Scope type</Label>
                <Input id="scope-type" value={form.scopeType} onChange={(event) => setForm((current) => ({ ...current, scopeType: event.target.value }))} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="scope-key">Scope key</Label>
                <Input id="scope-key" value={form.scopeKey} onChange={(event) => setForm((current) => ({ ...current, scopeKey: event.target.value }))} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="workspace-path">Workspace path</Label>
              <Input id="workspace-path" value={form.workspacePath} onChange={(event) => setForm((current) => ({ ...current, workspacePath: event.target.value }))} />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="repo-root">Repo root</Label>
                <Input id="repo-root" value={form.repoRoot} onChange={(event) => setForm((current) => ({ ...current, repoRoot: event.target.value }))} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="default-branch">Default branch</Label>
                <Input id="default-branch" value={form.defaultBranch} onChange={(event) => setForm((current) => ({ ...current, defaultBranch: event.target.value }))} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="env-profile">Env profile</Label>
                <Input id="env-profile" value={form.envProfile} onChange={(event) => setForm((current) => ({ ...current, envProfile: event.target.value }))} />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Enabled</p>
                <p className="text-xs text-muted-foreground">Disabled bindings stay visible but won’t be used for routing.</p>
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
              setForm(EMPTY_WORKSPACE_BINDING);
            }}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving}>{saving ? "Saving..." : editingId ? "Save changes" : "Create binding"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContent>
  );
}
