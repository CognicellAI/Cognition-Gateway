"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CpuIcon, ChevronDownIcon, SearchIcon, XIcon, CheckIcon, LoaderIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { ProviderResponse, ModelInfo } from "@/types/cognition";

interface ModelPickerProps {
  providers: ProviderResponse[];
  selectedProviderId: string;
  selectedModel: string;
  onProviderChange: (providerId: string) => void;
  onModelChange: (model: string) => void;
  disabled?: boolean;
}

export function ModelPicker({
  providers,
  selectedProviderId,
  selectedModel,
  onProviderChange,
  onModelChange,
  disabled = false,
}: ModelPickerProps) {
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const activeProvider = providers.find(p => p.id === selectedProviderId);

  // Load models when provider changes
  const loadModels = useCallback(async (providerId: string) => {
    if (!providerId) { setModels([]); return; }
    setModelsLoading(true);
    try {
      const res = await fetch(`/api/c/models/providers/${encodeURIComponent(providerId)}/models`);
      if (res.ok) {
        const data = await res.json();
        setModels(data.models ?? []);
      } else {
        setModels([]);
      }
    } catch {
      setModels([]);
    } finally {
      setModelsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedProviderId) {
      loadModels(selectedProviderId);
    } else {
      setModels([]);
    }
  }, [selectedProviderId, loadModels]);

  // Focus search when popover opens
  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 50);
    } else {
      setSearch("");
    }
  }, [open]);

  const filteredModels = search.trim()
    ? models.filter(m =>
        m.id.toLowerCase().includes(search.toLowerCase()) ||
        (m.display_name ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : models;

  // Compose the trigger label
  const triggerLabel = (() => {
    if (selectedModel) {
      const info = models.find(m => m.id === selectedModel);
      const label = info?.display_name ?? selectedModel;
      return label.length > 20 ? label.slice(0, 18) + "…" : label;
    }
    if (activeProvider) {
      return activeProvider.display_name ?? activeProvider.id;
    }
    return null;
  })();

  const handleProviderSelect = (id: string) => {
    onProviderChange(id);
    onModelChange(""); // reset model when provider changes
  };

  const handleModelSelect = (modelId: string) => {
    onModelChange(modelId === selectedModel ? "" : modelId);
    setOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onProviderChange("");
    onModelChange("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-9 gap-1.5 shrink-0 max-w-44",
            triggerLabel ? "pr-1.5" : "w-9 px-0"
          )}
          disabled={disabled}
        >
          <CpuIcon className="h-3.5 w-3.5 shrink-0" />
          {triggerLabel && (
            <span className="truncate text-xs">{triggerLabel}</span>
          )}
          {triggerLabel ? (
            <>
              <XIcon
                className="h-3 w-3 shrink-0 text-muted-foreground hover:text-foreground"
                onClick={handleClear}
              />
            </>
          ) : (
            <ChevronDownIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-80 p-0" align="start" side="top">
        {/* Provider selector */}
        <div className="p-2 border-b">
          <p className="text-xs font-medium text-muted-foreground px-1 mb-1.5">Provider</p>
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => handleProviderSelect("")}
              className={cn(
                "rounded-md px-2 py-1 text-xs transition-colors",
                !selectedProviderId
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-muted/80 text-foreground"
              )}
            >
              Auto
            </button>
            {providers.map(p => (
              <button
                key={p.id}
                onClick={() => handleProviderSelect(p.id)}
                className={cn(
                  "rounded-md px-2 py-1 text-xs transition-colors",
                  selectedProviderId === p.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted hover:bg-muted/80 text-foreground"
                )}
              >
                {p.display_name ?? p.id}
              </button>
            ))}
          </div>
        </div>

        {/* Model selector */}
        <div className="flex flex-col">
          {selectedProviderId && (
            <div className="p-2 border-b">
              <div className="relative">
                <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  ref={searchRef}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search models…"
                  className="pl-7 h-7 text-xs"
                />
              </div>
            </div>
          )}

          <div className="max-h-60 overflow-y-auto">
            {!selectedProviderId && (
              <div className="p-4 text-center text-xs text-muted-foreground">
                Select a provider to browse models
              </div>
            )}

            {selectedProviderId && modelsLoading && (
              <div className="flex items-center justify-center gap-2 p-4 text-xs text-muted-foreground">
                <LoaderIcon className="h-3.5 w-3.5 animate-spin" />
                Loading models…
              </div>
            )}

            {selectedProviderId && !modelsLoading && filteredModels.length === 0 && (
              <div className="p-4 text-center text-xs text-muted-foreground">
                {search ? "No models match your search" : "No catalog models for this provider"}
              </div>
            )}

            {selectedProviderId && !modelsLoading && filteredModels.length > 0 && (
              <div className="py-1">
                {/* Auto option at top */}
                <button
                  onClick={() => { onModelChange(""); setOpen(false); }}
                  className={cn(
                    "w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-accent transition-colors",
                    !selectedModel && "bg-accent/50"
                  )}
                >
                  <span className="text-muted-foreground">Auto (provider default)</span>
                  {!selectedModel && <CheckIcon className="h-3.5 w-3.5 text-primary" />}
                </button>

                {filteredModels.map(m => (
                  <button
                    key={m.id}
                    onClick={() => handleModelSelect(m.id)}
                    className={cn(
                      "w-full flex items-start justify-between px-3 py-2 text-xs hover:bg-accent transition-colors gap-2",
                      selectedModel === m.id && "bg-accent/50"
                    )}
                  >
                    <div className="flex-1 min-w-0 text-left">
                      <div className="truncate font-medium">{m.display_name ?? m.id}</div>
                      {m.display_name && (
                        <div className="truncate text-muted-foreground font-mono">{m.id}</div>
                      )}
                      <div className="flex gap-1.5 mt-0.5 flex-wrap">
                        {m.context_window && (
                          <span className="text-muted-foreground">
                            {m.context_window >= 1_000_000
                              ? `${(m.context_window / 1_000_000).toFixed(1)}M ctx`
                              : `${Math.round(m.context_window / 1000)}k ctx`}
                          </span>
                        )}
                        {m.capabilities.includes("tool_call") && (
                          <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">Tools</Badge>
                        )}
                        {m.capabilities.includes("vision") && (
                          <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">Vision</Badge>
                        )}
                      </div>
                    </div>
                    {selectedModel === m.id && (
                      <CheckIcon className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
