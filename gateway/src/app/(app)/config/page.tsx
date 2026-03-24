"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageContent } from "@/components/layout/page-content";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { CheckCircleIcon, XCircleIcon, RotateCcwIcon } from "lucide-react";
import type { ConfigResponse, ConfigUpdateRequest } from "@/types/cognition";

interface FormState {
  llm_provider: string;
  llm_model: string;
  llm_temperature: string;
  llm_max_tokens: string;
  rate_limit_per_minute: string;
  rate_limit_burst: string;
}

function configToForm(config: ConfigResponse): FormState {
  return {
    llm_provider: config.llm.provider,
    llm_model: config.llm.model,
    llm_temperature: config.llm.temperature !== null ? String(config.llm.temperature) : "",
    llm_max_tokens: config.llm.max_tokens !== null ? String(config.llm.max_tokens) : "",
    rate_limit_per_minute: String(config.rate_limit.per_minute),
    rate_limit_burst: String(config.rate_limit.burst),
  };
}

function formToUpdate(form: FormState): ConfigUpdateRequest {
  const update: ConfigUpdateRequest = {};

  const llmPatch: ConfigUpdateRequest["llm"] = {};
  if (form.llm_provider.trim()) llmPatch.provider = form.llm_provider.trim();
  if (form.llm_model.trim()) llmPatch.model = form.llm_model.trim();
  if (form.llm_temperature.trim() !== "") {
    const t = parseFloat(form.llm_temperature);
    if (!isNaN(t)) llmPatch.temperature = t;
  }
  if (form.llm_max_tokens.trim() !== "") {
    const m = parseInt(form.llm_max_tokens, 10);
    if (!isNaN(m)) llmPatch.max_tokens = m;
  }
  if (Object.keys(llmPatch).length > 0) update.llm = llmPatch;

  const pm = parseInt(form.rate_limit_per_minute, 10);
  const burst = parseInt(form.rate_limit_burst, 10);
  if (!isNaN(pm) || !isNaN(burst)) {
    update.rate_limit = {};
    if (!isNaN(pm)) update.rate_limit.per_minute = pm;
    if (!isNaN(burst)) update.rate_limit.burst = burst;
  }

  return update;
}

export default function ConfigPage() {
  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<"ok" | "fail" | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    setFetchError(null);
    try {
      const res = await fetch("/api/c/config");
      if (!res.ok) throw new Error(`Config fetch failed: ${res.status}`);
      const data: ConfigResponse = await res.json();
      setConfig(data);
      setForm(configToForm(data));
    } catch (e: unknown) {
      setFetchError(e instanceof Error ? e.message : "Failed to load config");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const handleSave = useCallback(async () => {
    if (!form) return;
    setSaving(true);
    setSaveResult(null);
    try {
      const update = formToUpdate(form);
      const res = await fetch("/api/c/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
      });
      if (!res.ok) throw new Error(`Save failed: ${res.status}`);
      const updated: ConfigResponse = await res.json();
      setConfig(updated);
      setForm(configToForm(updated));
      setSaveResult("ok");
      setTimeout(() => setSaveResult(null), 3000);
    } catch {
      setSaveResult("fail");
    } finally {
      setSaving(false);
    }
  }, [form]);

  const handleRollback = useCallback(async () => {
    setSaving(true);
    setSaveResult(null);
    try {
      const res = await fetch("/api/c/config/rollback", { method: "POST" });
      if (!res.ok) throw new Error(`Rollback failed: ${res.status}`);
      await fetchConfig();
      setSaveResult("ok");
      setTimeout(() => setSaveResult(null), 3000);
    } catch {
      setSaveResult("fail");
    } finally {
      setSaving(false);
    }
  }, [fetchConfig]);

  function setField(key: keyof FormState, value: string) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  return (
    <PageContent contentClassName="max-w-2xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Configuration</h1>
          <p className="text-muted-foreground mt-1">
            Runtime configuration for the connected Cognition server
          </p>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" disabled={loading || saving}>
              <RotateCcwIcon className="h-4 w-4 mr-2" />
              Rollback
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Rollback configuration?</AlertDialogTitle>
              <AlertDialogDescription>
                This will revert all settings to the last saved checkpoint on the Cognition server.
                Any unsaved changes will be lost.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleRollback}>Rollback</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {loading && (
        <div className="space-y-4">
          <Skeleton className="h-48 rounded-lg" />
          <Skeleton className="h-32 rounded-lg" />
        </div>
      )}

      {fetchError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {fetchError}
        </div>
      )}

      {!loading && !fetchError && form && config && (
        <div className="space-y-4">
          {/* Read-only server info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Server</CardTitle>
              <CardDescription>Read-only server parameters</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-y-2 text-sm">
              <span className="text-muted-foreground">Host</span>
              <span className="font-mono">{config.server.host}:{config.server.port}</span>
              <span className="text-muted-foreground">Log level</span>
              <span className="font-mono">{config.server.log_level}</span>
              <span className="text-muted-foreground">Max sessions</span>
              <span>{config.server.max_sessions}</span>
              <span className="text-muted-foreground">Session timeout</span>
              <span>{config.server.session_timeout_seconds}s</span>
              <span className="text-muted-foreground">Scoping</span>
              <span>{config.server.scoping_enabled ? "Enabled" : "Disabled"}</span>
            </CardContent>
          </Card>

          {/* LLM settings */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">LLM</CardTitle>
              <CardDescription>Language model settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="llm_provider">Provider</Label>
                  <Input
                    id="llm_provider"
                    value={form.llm_provider}
                    onChange={(e) => setField("llm_provider", e.target.value)}
                    placeholder="openai"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="llm_model">Model</Label>
                  <Input
                    id="llm_model"
                    value={form.llm_model}
                    onChange={(e) => setField("llm_model", e.target.value)}
                    placeholder="gpt-4o"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="llm_temperature">Temperature</Label>
                  <Input
                    id="llm_temperature"
                    type="number"
                    min="0"
                    max="2"
                    step="0.1"
                    value={form.llm_temperature}
                    onChange={(e) => setField("llm_temperature", e.target.value)}
                    placeholder="0.7"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="llm_max_tokens">Max tokens</Label>
                  <Input
                    id="llm_max_tokens"
                    type="number"
                    min="1"
                    value={form.llm_max_tokens}
                    onChange={(e) => setField("llm_max_tokens", e.target.value)}
                    placeholder="4096"
                  />
                </div>
              </div>
              {config.llm.available_providers.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Available providers:{" "}
                  {config.llm.available_providers.map((p) => p.name).join(", ")}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Rate limit settings */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Rate Limiting</CardTitle>
              <CardDescription>Request rate limits applied per user scope</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="rate_per_minute">Requests / minute</Label>
                <Input
                  id="rate_per_minute"
                  type="number"
                  min="1"
                  value={form.rate_limit_per_minute}
                  onChange={(e) => setField("rate_limit_per_minute", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rate_burst">Burst</Label>
                <Input
                  id="rate_burst"
                  type="number"
                  min="1"
                  value={form.rate_limit_burst}
                  onChange={(e) => setField("rate_limit_burst", e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Save bar */}
          <div className="flex items-center gap-3">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
            {saveResult === "ok" && (
              <div className="flex items-center gap-1 text-sm text-emerald-600">
                <CheckCircleIcon className="h-4 w-4" />
                Saved
              </div>
            )}
            {saveResult === "fail" && (
              <div className="flex items-center gap-1 text-sm text-destructive">
                <XCircleIcon className="h-4 w-4" />
                Save failed
              </div>
            )}
          </div>
        </div>
      )}
    </PageContent>
  );
}
