"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import {
  KeyRoundIcon,
  PlusIcon,
  TrashIcon,
  CopyIcon,
  CheckIcon,
  EyeIcon,
} from "lucide-react";

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Reveal dialog — shown once after creation
  const [revealOpen, setRevealOpen] = useState(false);
  const [revealedKey, setRevealedKey] = useState("");
  const [copied, setCopied] = useState(false);

  const fetchKeys = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch("/api/user/api-keys")
      .then((r) => {
        if (!r.ok) throw new Error(`Server responded ${r.status}`);
        return r.json();
      })
      .then((d: { keys: ApiKey[] }) => setKeys(d.keys ?? []))
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Failed to load API keys"),
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  async function handleCreate() {
    if (!newKeyName.trim()) {
      setCreateError("Name is required.");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/user/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName.trim() }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? `Request failed: ${res.status}`);
      }
      const data = (await res.json()) as { fullKey: string };
      setCreateOpen(false);
      setNewKeyName("");
      setRevealedKey(data.fullKey);
      setCopied(false);
      setRevealOpen(true);
      fetchKeys();
    } catch (e: unknown) {
      setCreateError(e instanceof Error ? e.message : "Failed to create key");
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: string) {
    await fetch(`/api/user/api-keys/${id}`, { method: "DELETE" });
    fetchKeys();
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(revealedKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard not available in some contexts
    }
  }

  return (
    <div className="mx-auto max-w-2xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">API Keys</h1>
          <p className="text-muted-foreground mt-1">
            Programmatic access to the Cognition Gateway
          </p>
        </div>
        <Button onClick={() => { setCreateOpen(true); setNewKeyName(""); setCreateError(null); }}>
          <PlusIcon className="h-4 w-4 mr-2" />
          Generate key
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Your API Keys</CardTitle>
          <CardDescription>
            Keys authenticate as you and carry your permissions. Treat them like passwords — they
            are only shown once at creation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading && (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 rounded-lg" />
              ))}
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {!loading && !error && keys.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
              <KeyRoundIcon className="h-8 w-8 opacity-30" />
              <p className="text-sm">No API keys yet</p>
              <p className="text-xs opacity-60">Generate a key to access the Gateway programmatically</p>
            </div>
          )}

          {!loading && !error && keys.length > 0 && (
            <div className="divide-y">
              {keys.map((key) => (
                <ApiKeyRow key={key.id} apiKey={key} onRevoke={handleRevoke} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Generate new API key</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="key-name">Key name</Label>
              <Input
                id="key-name"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="CI pipeline, local dev, …"
                onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                A descriptive label to identify where this key is used.
              </p>
            </div>
            {createError && (
              <p className="text-sm text-destructive">{createError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? "Generating…" : "Generate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reveal Dialog */}
      <Dialog open={revealOpen} onOpenChange={setRevealOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <EyeIcon className="h-5 w-5 text-emerald-500" />
              Save your API key
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              This is the only time your full API key will be shown. Copy it now — you
              cannot retrieve it again.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-md bg-muted px-3 py-2 text-sm font-mono break-all">
                {revealedKey}
              </code>
              <Button
                variant="outline"
                size="icon"
                className="shrink-0"
                onClick={handleCopy}
              >
                {copied ? (
                  <CheckIcon className="h-4 w-4 text-emerald-500" />
                ) : (
                  <CopyIcon className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Use this key as a{" "}
              <code className="bg-muted px-1 rounded text-xs">Bearer</code> token in the{" "}
              <code className="bg-muted px-1 rounded text-xs">Authorization</code> header:
            </p>
            <pre className="rounded-md bg-muted px-3 py-2 text-xs font-mono overflow-x-auto">
              {`Authorization: Bearer ${revealedKey}`}
            </pre>
          </div>
          <DialogFooter>
            <Button onClick={() => setRevealOpen(false)}>I&apos;ve saved it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ApiKeyRow({
  apiKey,
  onRevoke,
}: {
  apiKey: ApiKey;
  onRevoke: (id: string) => void;
}) {
  const isExpired = apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date();

  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm truncate">{apiKey.name}</span>
          {isExpired && (
            <Badge variant="destructive" className="text-xs">
              expired
            </Badge>
          )}
          {apiKey.expiresAt && !isExpired && (
            <Badge variant="outline" className="text-xs">
              expires {new Date(apiKey.expiresAt).toLocaleDateString()}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
          <code className="bg-muted px-1.5 py-0.5 rounded font-mono">
            {apiKey.keyPrefix}••••••••
          </code>
          <span>Created {new Date(apiKey.createdAt).toLocaleDateString()}</span>
          {apiKey.lastUsedAt ? (
            <span>Last used {new Date(apiKey.lastUsedAt).toLocaleDateString()}</span>
          ) : (
            <span className="opacity-60">Never used</span>
          )}
        </div>
      </div>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
            <TrashIcon className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke &quot;{apiKey.name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              Any integrations using this key will immediately lose access. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => onRevoke(apiKey.id)}
            >
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
