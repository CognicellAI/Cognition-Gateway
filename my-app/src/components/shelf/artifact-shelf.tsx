"use client";

import { useState, useCallback } from "react";
import {
  FileCodeIcon,
  XIcon,
  CopyIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useChatStore } from "@/hooks/use-chat-store";
import { cn } from "@/lib/utils";
import type { Artifact } from "@/hooks/use-chat-store";

interface ArtifactShelfProps {
  sessionId: string;
}

/**
 * Artifact Shelf — a persistent tray of notable outputs (code blocks, files)
 * pinned above the chat input. Each artifact can be expanded, copied, or
 * referenced in a follow-up message via @artifact-label syntax.
 */
export function ArtifactShelf({ sessionId }: ArtifactShelfProps) {
  const { artifactsBySession, removeArtifact } = useChatStore();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [shelfCollapsed, setShelfCollapsed] = useState(false);

  const artifacts = artifactsBySession.get(sessionId) ?? [];

  if (artifacts.length === 0) return null;

  return (
    <div className="border-t bg-muted/30">
      {/* Shelf header */}
      <div className="flex items-center justify-between px-4 py-1.5 border-b border-border/50">
        <button
          onClick={() => setShelfCollapsed((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {shelfCollapsed ? (
            <ChevronUpIcon className="h-3 w-3" />
          ) : (
            <ChevronDownIcon className="h-3 w-3" />
          )}
          <span className="font-medium">Artifacts</span>
          <span className="opacity-60">({artifacts.length})</span>
        </button>
        <p className="text-[11px] text-muted-foreground/60">
          Type <code className="bg-muted px-1 rounded">@label</code> to reference in a message
        </p>
      </div>

      {!shelfCollapsed && (
        <>
          {/* Chip row */}
          <div className="flex items-center gap-1.5 px-3 py-2 overflow-x-auto">
            {artifacts.map((artifact) => (
              <ArtifactChip
                key={artifact.id}
                artifact={artifact}
                isExpanded={expanded === artifact.id}
                onToggle={() => setExpanded(expanded === artifact.id ? null : artifact.id)}
                onRemove={() => {
                  removeArtifact(sessionId, artifact.id);
                  if (expanded === artifact.id) setExpanded(null);
                }}
              />
            ))}
          </div>

          {/* Expanded artifact viewer */}
          {expanded && (
            <ExpandedArtifact
              artifact={artifacts.find((a) => a.id === expanded)!}
              onClose={() => setExpanded(null)}
            />
          )}
        </>
      )}
    </div>
  );
}

function ArtifactChip({
  artifact,
  isExpanded,
  onToggle,
  onRemove,
}: {
  artifact: Artifact;
  isExpanded: boolean;
  onToggle: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded-full border bg-background pl-2 pr-1 py-0.5 text-xs transition-colors cursor-pointer shrink-0",
        isExpanded
          ? "border-primary/50 bg-primary/5"
          : "hover:border-border hover:bg-accent",
      )}
    >
      <button onClick={onToggle} className="flex items-center gap-1.5">
        <FileCodeIcon className="h-3 w-3 text-muted-foreground" />
        <span className="font-mono max-w-[120px] truncate">{artifact.label}</span>
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="ml-0.5 rounded-full p-0.5 hover:bg-muted transition-colors"
      >
        <XIcon className="h-2.5 w-2.5 text-muted-foreground" />
      </button>
    </div>
  );
}

function ExpandedArtifact({
  artifact,
  onClose,
}: {
  artifact: Artifact;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(artifact.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable
    }
  }, [artifact.content]);

  return (
    <div className="border-t border-border/50 bg-background/60 max-h-64">
      {/* Viewer header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/30">
        <span className="text-xs font-mono text-muted-foreground">{artifact.label}</span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={handleCopy}
          >
            {copied ? (
              <CheckIcon className="h-3 w-3 text-emerald-500" />
            ) : (
              <CopyIcon className="h-3 w-3" />
            )}
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
            <XIcon className="h-3 w-3" />
          </Button>
        </div>
      </div>
      <ScrollArea className="h-52">
        <pre className="p-3 text-xs font-mono leading-relaxed whitespace-pre-wrap break-all">
          {artifact.content}
        </pre>
      </ScrollArea>
    </div>
  );
}
