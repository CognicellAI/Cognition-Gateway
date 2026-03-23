"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CpuIcon, SearchIcon, XIcon, WrenchIcon, AlertTriangleIcon, DollarSignIcon } from "lucide-react";
import type { ModelInfo } from "@/types/cognition";

const CAPABILITY_LABELS: Record<string, string> = {
  tool_call: "Tools",
  reasoning: "Reasoning",
  vision: "Vision",
  structured_output: "Structured",
  audio_input: "Audio in",
  audio_output: "Audio out",
  image_output: "Image out",
  pdf_input: "PDF",
};

const PROVIDER_FILTERS = [
  { value: "", label: "All providers" },
  { value: "bedrock", label: "Bedrock" },
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "google_genai", label: "Google" },
];

function formatCost(cost: number | null): string | null {
  if (cost === null || cost === 0) return null;
  if (cost < 0.01) return `$${(cost * 1000).toFixed(3)}/M (×1k)`;
  return `$${cost.toFixed(3)}/M`;
}

function formatContext(tokens: number | null): string | null {
  if (!tokens) return null;
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M ctx`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(0)}k ctx`;
  return `${tokens} ctx`;
}

export default function ModelsPage() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [providerFilter, setProviderFilter] = useState("");
  const [toolCallOnly, setToolCallOnly] = useState(false);

  const fetchModels = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (providerFilter) params.set("provider", providerFilter);
    if (toolCallOnly) params.set("tool_call", "true");
    if (search.trim()) params.set("q", search.trim());

    try {
      const res = await fetch(`/api/c/models?${params}`);
      if (!res.ok) throw new Error(`Server responded ${res.status}`);
      const data = await res.json();
      setModels(data.models ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load models");
    } finally {
      setLoading(false);
    }
  }, [providerFilter, toolCallOnly, search]);

  // Fetch on filter change (debounce search)
  useEffect(() => {
    const timer = setTimeout(fetchModels, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [fetchModels, search]);

  const byProvider = models.reduce<Record<string, ModelInfo[]>>((acc, m) => {
    const p = m.provider ?? "unknown";
    if (!acc[p]) acc[p] = [];
    acc[p].push(m);
    return acc;
  }, {});

  const hasFilters = providerFilter || toolCallOnly || search;

  return (
    <div className="mx-auto max-w-5xl p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Models</h1>
        <p className="text-muted-foreground mt-1">
          Model catalog powered by <a href="https://models.dev" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-foreground">models.dev</a>
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-48">
          <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or ID…"
            className="pl-8 h-8 text-sm"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <XIcon className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex gap-1.5 flex-wrap">
          {PROVIDER_FILTERS.map(f => (
            <Button
              key={f.value}
              variant={providerFilter === f.value ? "default" : "outline"}
              size="sm"
              className="h-8 text-xs"
              onClick={() => setProviderFilter(f.value)}
            >
              {f.label}
            </Button>
          ))}
        </div>

        <Button
          variant={toolCallOnly ? "default" : "outline"}
          size="sm"
          className="h-8 text-xs gap-1.5"
          onClick={() => setToolCallOnly(v => !v)}
        >
          <WrenchIcon className="h-3 w-3" />
          Tool call
        </Button>

        {hasFilters && (
          <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={() => { setSearch(""); setProviderFilter(""); setToolCallOnly(false); }}>
            <XIcon className="h-3 w-3 mr-1" />Clear
          </Button>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive flex items-start gap-2">
          <AlertTriangleIcon className="h-4 w-4 mt-0.5 shrink-0" />{error}
        </div>
      )}

      {loading && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-lg" />)}
        </div>
      )}

      {!loading && !error && models.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
          <CpuIcon className="h-10 w-10 opacity-30" />
          <p>No models found</p>
          {hasFilters && <p className="text-sm">Try adjusting your filters</p>}
          {!hasFilters && <p className="text-sm">The model catalog may be loading — try refreshing</p>}
        </div>
      )}

      {!loading && !error && Object.entries(byProvider).map(([provider, providerModels]) => (
        <section key={provider} className="space-y-3">
          <div className="flex items-center gap-2">
            <CpuIcon className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{provider}</h2>
            <span className="text-xs text-muted-foreground/60">
              {providerModels.length} model{providerModels.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {providerModels.map(model => (
              <ModelCard key={model.id} model={model} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function ModelCard({ model }: { model: ModelInfo }) {
  const isDeprecated = model.status === "deprecated";
  const inputCostStr = formatCost(model.input_cost);
  const outputCostStr = formatCost(model.output_cost);
  const contextStr = formatContext(model.context_window);

  return (
    <Card className={isDeprecated ? "opacity-60" : ""}>
      <CardHeader className="pb-1">
        <div className="flex items-start justify-between gap-1">
          <CardTitle className="text-sm font-medium leading-tight line-clamp-2">
            {model.display_name ?? model.id}
          </CardTitle>
          {model.status && (
            <Badge variant="outline" className="text-xs shrink-0">{model.status}</Badge>
          )}
        </div>
        {model.display_name && (
          <p className="text-xs text-muted-foreground font-mono truncate">{model.id}</p>
        )}
        {model.family && (
          <p className="text-xs text-muted-foreground">{model.family}</p>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          {contextStr && (
            <span className="text-xs text-muted-foreground">{contextStr}</span>
          )}
          {(inputCostStr || outputCostStr) && (
            <span className="text-xs text-muted-foreground flex items-center gap-0.5">
              <DollarSignIcon className="h-3 w-3" />
              {[inputCostStr, outputCostStr].filter(Boolean).join(" / ")}
            </span>
          )}
        </div>
        {model.capabilities.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {model.capabilities.map(cap => (
              <Badge key={cap} variant="secondary" className="text-xs">
                {CAPABILITY_LABELS[cap] ?? cap}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
