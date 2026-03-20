"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { PlugZapIcon, PlusIcon, PencilIcon, TrashIcon, CheckCircleIcon, XCircleIcon, LoaderIcon, AlertTriangleIcon, DatabaseIcon } from "lucide-react";
import type { ProviderResponse, ProviderCreate, ProviderUpdate, ProviderType, ProviderTestResponse } from "@/types/cognition";

const PROVIDER_TYPES: { value: ProviderType; label: string }[] = [
  { value: "bedrock", label: "Amazon Bedrock" },
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "openai_compatible", label: "OpenAI Compatible (e.g. OpenRouter)" },
  { value: "google_genai", label: "Google GenAI" },
  { value: "google_vertexai", label: "Google Vertex AI" },
];

const DEFAULT_API_KEY_ENV: Record<ProviderType, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  openai_compatible: "COGNITION_OPENAI_COMPATIBLE_API_KEY",
  google_genai: "GOOGLE_API_KEY",
  google_vertexai: "",
  bedrock: "",
  mock: "",
};

function parseApiError(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  return "An unknown error occurred";
}

async function extractApiError(res: Response): Promise<string> {
  const body = await res.json().catch(() => ({}));
  if (typeof body.detail === "string") return body.detail;
  if (Array.isArray(body.detail)) return body.detail.map((d: {msg?: string}) => d.msg ?? String(d)).join("; ");
  return `Request failed: ${res.status}`;
}

export default function ProvidersPage() {
  const [providers, setProviders] = useState<ProviderResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<ProviderResponse | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, ProviderTestResponse>>({});

  // Form state
  const [fId, setFId] = useState("");
  const [fProvider, setFProvider] = useState<ProviderType>("bedrock");
  const [fModel, setFModel] = useState("");
  const [fDisplayName, setFDisplayName] = useState("");
  const [fApiKeyEnv, setFApiKeyEnv] = useState("");
  const [fBaseUrl, setFBaseUrl] = useState("");
  const [fRegion, setFRegion] = useState("");
  const [fEnabled, setFEnabled] = useState(true);
  const [fError, setFError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchProviders = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/c/models/providers");
      if (!res.ok) throw new Error(`Server responded ${res.status}`);
      const data = await res.json();
      setProviders(data.providers ?? []);
    } catch (e) {
      setError(parseApiError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProviders(); }, [fetchProviders]);

  const resetForm = () => {
    setFId(""); setFProvider("bedrock"); setFModel(""); setFDisplayName("");
    setFApiKeyEnv(""); setFBaseUrl(""); setFRegion(""); setFEnabled(true); setFError(null);
  };

  const handleProviderTypeChange = (type: ProviderType) => {
    setFProvider(type);
    setFApiKeyEnv(DEFAULT_API_KEY_ENV[type] ?? "");
    if (type === "openai_compatible") setFBaseUrl("https://openrouter.ai/api/v1");
    else setFBaseUrl("");
    if (type === "bedrock") setFRegion("us-east-1");
    else setFRegion("");
  };

  const handleCreate = async () => {
    if (!fId.trim()) { setFError("ID is required"); return; }
    if (!fModel.trim()) { setFError("Model is required"); return; }
    setSubmitting(true); setFError(null);

    const payload: ProviderCreate = {
      id: fId.trim(),
      provider: fProvider,
      model: fModel.trim(),
      display_name: fDisplayName.trim() || undefined,
      enabled: fEnabled,
      api_key_env: fApiKeyEnv.trim() || undefined,
      base_url: fBaseUrl.trim() || undefined,
      region: fRegion.trim() || undefined,
    };

    try {
      const res = await fetch("/api/c/models/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await extractApiError(res));
      setCreateOpen(false); resetForm(); await fetchProviders();
    } catch (e) { setFError(parseApiError(e)); }
    finally { setSubmitting(false); }
  };

  const handleEdit = async () => {
    if (!editingProvider) return;
    if (!fModel.trim()) { setFError("Model is required"); return; }
    setSubmitting(true); setFError(null);

    const payload: ProviderUpdate = {
      model: fModel.trim() || undefined,
      display_name: fDisplayName.trim() || undefined,
      enabled: fEnabled,
      api_key_env: fApiKeyEnv.trim() || undefined,
      base_url: fBaseUrl.trim() || undefined,
      region: fRegion.trim() || undefined,
    };

    try {
      const res = await fetch(`/api/c/models/providers/${encodeURIComponent(editingProvider.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await extractApiError(res));
      setEditOpen(false); setEditingProvider(null); resetForm(); await fetchProviders();
    } catch (e) { setFError(parseApiError(e)); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/c/models/providers/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error(await extractApiError(res));
      await fetchProviders();
    } catch (e) { setError(parseApiError(e)); }
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    try {
      const res = await fetch(`/api/c/models/providers/${encodeURIComponent(id)}/test`, { method: "POST" });
      if (!res.ok) throw new Error(await extractApiError(res));
      const result: ProviderTestResponse = await res.json();
      setTestResult(prev => ({ ...prev, [id]: result }));
    } catch (e) {
      setTestResult(prev => ({ ...prev, [id]: { success: false, provider: id, model: "", message: parseApiError(e), response_preview: null } }));
    } finally { setTestingId(null); }
  };

  const openCreate = () => { resetForm(); setCreateOpen(true); };
  const openEdit = (p: ProviderResponse) => {
    setEditingProvider(p);
    setFProvider(p.provider); setFModel(p.model);
    setFDisplayName(p.display_name ?? ""); setFApiKeyEnv(p.api_key_env ?? "");
    setFBaseUrl(p.base_url ?? ""); setFRegion(p.region ?? ""); setFEnabled(p.enabled);
    setFError(null); setEditOpen(true);
  };

  return (
    <div className="mx-auto max-w-4xl p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Providers</h1>
          <p className="text-muted-foreground mt-1">LLM provider configurations for the connected Cognition server</p>
        </div>
        <Button onClick={openCreate} className="shrink-0">
          <PlusIcon className="h-4 w-4 mr-2" />New provider
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive flex items-start gap-2">
          <AlertTriangleIcon className="h-4 w-4 mt-0.5 shrink-0" />{error}
        </div>
      )}

      {loading && (
        <div className="grid gap-4 sm:grid-cols-2">
          {[1, 2].map(i => <Skeleton key={i} className="h-40 rounded-lg" />)}
        </div>
      )}

      {!loading && !error && providers.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
          <PlugZapIcon className="h-10 w-10 opacity-30" />
          <p>No providers configured</p>
          <p className="text-sm">Add a provider to enable LLM inference</p>
        </div>
      )}

      {!loading && providers.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {providers.map(p => (
            <ProviderCard
              key={p.id}
              provider={p}
              testResult={testResult[p.id]}
              testing={testingId === p.id}
              onEdit={() => openEdit(p)}
              onDelete={() => handleDelete(p.id)}
              onTest={() => handleTest(p.id)}
            />
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add provider</DialogTitle></DialogHeader>
          <ProviderForm
            mode="create"
            fId={fId} setFId={setFId}
            fProvider={fProvider} onProviderTypeChange={handleProviderTypeChange}
            fModel={fModel} setFModel={setFModel}
            fDisplayName={fDisplayName} setFDisplayName={setFDisplayName}
            fApiKeyEnv={fApiKeyEnv} setFApiKeyEnv={setFApiKeyEnv}
            fBaseUrl={fBaseUrl} setFBaseUrl={setFBaseUrl}
            fRegion={fRegion} setFRegion={setFRegion}
            fEnabled={fEnabled} setFEnabled={setFEnabled}
            fError={fError} submitting={submitting}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={submitting}>Cancel</Button>
            <Button onClick={handleCreate} disabled={submitting}>{submitting ? "Adding..." : "Add provider"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit provider: {editingProvider?.id}</DialogTitle></DialogHeader>
          <ProviderForm
            mode="edit"
            fId={editingProvider?.id ?? ""} setFId={() => {}}
            fProvider={fProvider} onProviderTypeChange={() => {}}
            fModel={fModel} setFModel={setFModel}
            fDisplayName={fDisplayName} setFDisplayName={setFDisplayName}
            fApiKeyEnv={fApiKeyEnv} setFApiKeyEnv={setFApiKeyEnv}
            fBaseUrl={fBaseUrl} setFBaseUrl={setFBaseUrl}
            fRegion={fRegion} setFRegion={setFRegion}
            fEnabled={fEnabled} setFEnabled={setFEnabled}
            fError={fError} submitting={submitting}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={submitting}>Cancel</Button>
            <Button onClick={handleEdit} disabled={submitting}>{submitting ? "Saving..." : "Save changes"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── ProviderCard ──────────────────────────────────────────────────────────────

function ProviderCard({
  provider, testResult, testing, onEdit, onDelete, onTest,
}: {
  provider: ProviderResponse;
  testResult: ProviderTestResponse | undefined;
  testing: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onTest: () => void;
}) {
  const isSeeded = provider.source === "file";

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base font-mono">{provider.id}</CardTitle>
          <div className="flex gap-1 shrink-0 flex-wrap justify-end">
            {isSeeded && (
              <Badge variant="secondary" className="text-xs">
                <DatabaseIcon className="h-3 w-3 mr-1" />seeded
              </Badge>
            )}
            <Badge variant={provider.enabled ? "default" : "outline"} className="text-xs">
              {provider.enabled ? "enabled" : "disabled"}
            </Badge>
            <Badge variant="outline" className="text-xs">{provider.provider}</Badge>
          </div>
        </div>
        {provider.display_name && (
          <CardDescription className="text-xs">{provider.display_name}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-xs text-muted-foreground space-y-1">
          <div><span className="font-medium">Model:</span> <span className="font-mono">{provider.model}</span></div>
          {provider.region && <div><span className="font-medium">Region:</span> {provider.region}</div>}
          {provider.base_url && <div><span className="font-medium">Base URL:</span> <span className="truncate block">{provider.base_url}</span></div>}
          {provider.api_key_env && <div><span className="font-medium">Key env:</span> <span className="font-mono">{provider.api_key_env}</span></div>}
        </div>

        {testResult && (
          <div className={`rounded-md p-2 text-xs flex items-start gap-2 ${testResult.success ? "bg-green-500/10 text-green-700 dark:text-green-400" : "bg-destructive/10 text-destructive"}`}>
            {testResult.success
              ? <CheckCircleIcon className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              : <XCircleIcon className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
            <span>{testResult.success ? (testResult.response_preview ?? "Connection successful") : testResult.message}</span>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={onTest} disabled={testing} className="flex-1">
            {testing ? <LoaderIcon className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <CheckCircleIcon className="h-3.5 w-3.5 mr-1.5" />}
            {testing ? "Testing…" : "Test"}
          </Button>
          <Button variant="outline" size="sm" onClick={onEdit}>
            <PencilIcon className="h-3.5 w-3.5" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10">
                <TrashIcon className="h-3.5 w-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete provider</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete <strong>{provider.id}</strong>? This cannot be undone and will break any sessions using this provider.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onDelete} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}

// ── ProviderForm ──────────────────────────────────────────────────────────────

interface ProviderFormProps {
  mode: "create" | "edit";
  fId: string; setFId: (v: string) => void;
  fProvider: ProviderType; onProviderTypeChange: (v: ProviderType) => void;
  fModel: string; setFModel: (v: string) => void;
  fDisplayName: string; setFDisplayName: (v: string) => void;
  fApiKeyEnv: string; setFApiKeyEnv: (v: string) => void;
  fBaseUrl: string; setFBaseUrl: (v: string) => void;
  fRegion: string; setFRegion: (v: string) => void;
  fEnabled: boolean; setFEnabled: (v: boolean) => void;
  fError: string | null;
  submitting: boolean;
}

function ProviderForm({
  mode, fId, setFId, fProvider, onProviderTypeChange,
  fModel, setFModel, fDisplayName, setFDisplayName,
  fApiKeyEnv, setFApiKeyEnv, fBaseUrl, setFBaseUrl,
  fRegion, setFRegion, fError, submitting,
}: ProviderFormProps) {
  const needsApiKey = !["bedrock", "google_vertexai", "mock"].includes(fProvider);
  const needsBaseUrl = fProvider === "openai_compatible";
  const needsRegion = fProvider === "bedrock" || fProvider === "google_vertexai";

  return (
    <div className="space-y-4 py-4">
      {fError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {fError}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="f-id">ID <span className="text-destructive">*</span></Label>
        <Input
          id="f-id"
          value={fId}
          onChange={e => setFId(e.target.value)}
          placeholder="e.g., default, bedrock-prod, openrouter"
          disabled={submitting || mode === "edit"}
          className={mode === "edit" ? "bg-muted" : ""}
        />
        {mode === "edit" && <p className="text-xs text-muted-foreground">Provider ID cannot be changed</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="f-provider">Provider type <span className="text-destructive">*</span></Label>
        <Select value={fProvider} onValueChange={v => onProviderTypeChange(v as ProviderType)} disabled={submitting || mode === "edit"}>
          <SelectTrigger id="f-provider" className={mode === "edit" ? "bg-muted" : ""}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROVIDER_TYPES.map(pt => (
              <SelectItem key={pt.value} value={pt.value}>{pt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="f-model">Model <span className="text-destructive">*</span></Label>
        <Input
          id="f-model"
          value={fModel}
          onChange={e => setFModel(e.target.value)}
          placeholder={fProvider === "bedrock" ? "us.anthropic.claude-sonnet-4-6" : "gpt-4o-mini"}
          disabled={submitting}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="f-display-name">Display name</Label>
        <Input
          id="f-display-name"
          value={fDisplayName}
          onChange={e => setFDisplayName(e.target.value)}
          placeholder="e.g., Bedrock (Production)"
          disabled={submitting}
        />
      </div>

      {needsApiKey && (
        <div className="space-y-2">
          <Label htmlFor="f-api-key-env">API key env var</Label>
          <Input
            id="f-api-key-env"
            value={fApiKeyEnv}
            onChange={e => setFApiKeyEnv(e.target.value)}
            placeholder="OPENAI_API_KEY"
            disabled={submitting}
          />
          <p className="text-xs text-muted-foreground">Name of the environment variable containing the API key — never the key itself</p>
        </div>
      )}

      {needsBaseUrl && (
        <div className="space-y-2">
          <Label htmlFor="f-base-url">Base URL</Label>
          <Input
            id="f-base-url"
            value={fBaseUrl}
            onChange={e => setFBaseUrl(e.target.value)}
            placeholder="https://openrouter.ai/api/v1"
            disabled={submitting}
          />
        </div>
      )}

      {needsRegion && (
        <div className="space-y-2">
          <Label htmlFor="f-region">Region</Label>
          <Input
            id="f-region"
            value={fRegion}
            onChange={e => setFRegion(e.target.value)}
            placeholder="us-east-1"
            disabled={submitting}
          />
        </div>
      )}
    </div>
  );
}
