"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GithubIcon, WorkflowIcon } from "lucide-react";

interface DispatchRule {
  id: string;
  name: string;
  integrationType: string;
  eventType: string;
  actionFilter: string | null;
  agentName: string;
  promptTemplate: string;
  contextKeyTemplate: string | null;
  approvalMode: string;
  enabled: boolean;
}

const EMPTY_RULE = {
  name: "",
  integrationType: "github",
  eventType: "pull_request",
  actionFilter: "opened",
  agentName: "default",
  promptTemplate: "Review GitHub event: {{body}}",
  contextKeyTemplate: "{{repository.full_name}}:pull_request:{{pull_request.number}}",
  approvalMode: "none",
  enabled: true,
};

export default function IntegrationsPage() {
  const [rules, setRules] = useState<DispatchRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_RULE);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRules = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch("/api/dispatch-rules")
      .then((r) => {
        if (!r.ok) throw new Error(`Server responded ${r.status}`);
        return r.json();
      })
      .then((d) => setRules(d.rules ?? []))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load rules"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  async function handleCreate(): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/dispatch-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const payload = (await res.json()) as { error?: string };
        throw new Error(payload.error ?? `Request failed: ${res.status}`);
      }
      setDialogOpen(false);
      setForm(EMPTY_RULE);
      fetchRules();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save rule");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Integrations</h1>
          <p className="mt-1 text-muted-foreground">Define dispatch rules for GitHub events using the unified automation pipeline.</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>New dispatch rule</Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <GithubIcon className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">GitHub events</CardTitle>
            </div>
            <CardDescription>
              Model pull request and issue workflows as first-class dispatch rules instead of one-off webhook prompts.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Start by defining an event type, optional action filter, agent, prompt template, and context key template.
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <WorkflowIcon className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Execution model</CardTitle>
            </div>
            <CardDescription>
              Matching rules reuse the same dispatch pipeline as cron and webhooks, including approvals, activity, and session continuity.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Rules currently route GitHub-style webhook payloads through shared prompt and context rendering. Integration auth and richer event normalization come next.
          </CardContent>
        </Card>
      </div>

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

      {!loading && rules.length === 0 && (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          No dispatch rules yet. Start by defining a GitHub event mapping.
        </div>
      )}

      {!loading && rules.length > 0 && (
        <div className="space-y-3">
          {rules.map((rule) => (
            <Card key={rule.id}>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">{rule.name}</CardTitle>
                  <Badge variant="outline">{rule.integrationType}</Badge>
                  <Badge variant="secondary">{rule.eventType}</Badge>
                  {rule.actionFilter && <Badge>{rule.actionFilter}</Badge>}
                </div>
                <CardDescription>
                  Agent: <span className="font-mono">{rule.agentName}</span>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="text-muted-foreground whitespace-pre-wrap">{rule.promptTemplate}</p>
                {rule.contextKeyTemplate && (
                  <p className="text-xs text-muted-foreground">
                    Context key template: <span className="font-mono text-foreground">{rule.contextKeyTemplate}</span>
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>New dispatch rule</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="rule-name">Name</Label>
              <Input id="rule-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Integration</Label>
                <Select value={form.integrationType} onValueChange={(value) => setForm((f) => ({ ...f, integrationType: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="github">GitHub</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="rule-event">Event</Label>
                <Input id="rule-event" value={form.eventType} onChange={(e) => setForm((f) => ({ ...f, eventType: e.target.value }))} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="rule-action">Action filter</Label>
                <Input id="rule-action" value={form.actionFilter} onChange={(e) => setForm((f) => ({ ...f, actionFilter: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rule-agent">Agent</Label>
              <Input id="rule-agent" value={form.agentName} onChange={(e) => setForm((f) => ({ ...f, agentName: e.target.value }))} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rule-prompt">Prompt template</Label>
              <Textarea id="rule-prompt" rows={5} value={form.promptTemplate} onChange={(e) => setForm((f) => ({ ...f, promptTemplate: e.target.value }))} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rule-context">Context key template</Label>
              <Input id="rule-context" value={form.contextKeyTemplate} onChange={(e) => setForm((f) => ({ ...f, contextKeyTemplate: e.target.value }))} />
            </div>

            <div className="space-y-1.5">
              <Label>Approval</Label>
              <Select value={form.approvalMode} onValueChange={(value) => setForm((f) => ({ ...f, approvalMode: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No approval</SelectItem>
                  <SelectItem value="always">Always require approval</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => void handleCreate()} disabled={saving}>{saving ? "Saving..." : "Create rule"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
