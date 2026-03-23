"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { BotIcon, PlusIcon, PencilIcon, TrashIcon, WrenchIcon, SparklesIcon, LightbulbIcon, AlertTriangleIcon } from "lucide-react";
import type { AgentResponse, AgentCreate, AgentUpdate, SkillResponse } from "@/types/cognition";

function parseApiError(body: unknown): string {
  if (typeof body !== "object" || body === null) return "Request failed";
  const b = body as Record<string, unknown>;
  if (typeof b.detail === "string") return b.detail;
  if (Array.isArray(b.detail)) return b.detail.map((d: { msg?: string }) => d.msg ?? String(d)).join("; ");
  return "Request failed";
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentResponse[]>([]);
  const [skills, setSkills] = useState<SkillResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AgentResponse | null>(null);

  // Form state
  const [fName, setFName] = useState("");
  const [fDescription, setFDescription] = useState("");
  const [fMode, setFMode] = useState<"primary" | "subagent" | "all">("primary");
  const [fSystemPrompt, setFSystemPrompt] = useState("");
  const [fModel, setFModel] = useState("");
  const [fSkills, setFSkills] = useState<string[]>([]);
  const [fTools, setFTools] = useState("");
  const [fError, setFError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchAgents = useCallback(async () => {
    setError(null);
    try {
      const [agentsRes, skillsRes] = await Promise.all([
        fetch("/api/c/agents"),
        fetch("/api/c/skills"),
      ]);
      if (agentsRes.ok) {
        const data = await agentsRes.json();
        setAgents(data.agents ?? []);
      }
      if (skillsRes.ok) {
        const data = await skillsRes.json();
        setSkills(data.skills ?? []);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load agents");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAgents(); }, [fetchAgents]);

  const resetForm = () => {
    setFName(""); setFDescription(""); setFMode("primary");
    setFSystemPrompt(""); setFModel(""); setFSkills([]); setFTools(""); setFError(null);
  };

  const handleCreate = async () => {
    if (!fName.trim()) { setFError("Name is required"); return; }
    setSubmitting(true); setFError(null);

    const payload: AgentCreate = {
      name: fName.trim(),
      description: fDescription.trim() || undefined,
      mode: fMode,
      system_prompt: fSystemPrompt.trim() || undefined,
      model: fModel.trim() || undefined,
      skills: fSkills,
      tools: fTools.split(",").map(t => t.trim()).filter(Boolean),
    };

    try {
      const res = await fetch("/api/c/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(parseApiError(await res.json().catch(() => ({}))));
      setCreateOpen(false); resetForm(); await fetchAgents();
    } catch (e: unknown) {
      setFError(e instanceof Error ? e.message : "Failed to create agent");
    } finally { setSubmitting(false); }
  };

  const handleEdit = async () => {
    if (!editingAgent) return;
    setSubmitting(true); setFError(null);

    const payload: AgentUpdate = {
      description: fDescription.trim() || undefined,
      mode: fMode,
      system_prompt: fSystemPrompt.trim() || undefined,
      model: fModel.trim() || undefined,
      skills: fSkills,
      tools: fTools.split(",").map(t => t.trim()).filter(Boolean),
    };

    try {
      const res = await fetch(`/api/c/agents/${encodeURIComponent(editingAgent.name)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(parseApiError(await res.json().catch(() => ({}))));
      setEditOpen(false); setEditingAgent(null); resetForm(); await fetchAgents();
    } catch (e: unknown) {
      setFError(e instanceof Error ? e.message : "Failed to update agent");
    } finally { setSubmitting(false); }
  };

  const handleDelete = async (name: string) => {
    try {
      const res = await fetch(`/api/c/agents/${encodeURIComponent(name)}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error(parseApiError(await res.json().catch(() => ({}))));
      await fetchAgents();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to delete agent");
    }
  };

  const openEdit = (agent: AgentResponse) => {
    setEditingAgent(agent);
    setFName(agent.name);
    setFDescription(agent.description ?? "");
    setFMode(agent.mode);
    setFSystemPrompt(agent.system_prompt ?? "");
    setFModel(agent.model ?? "");
    setFSkills(agent.skills ?? []);
    setFTools((agent.tools ?? []).join(", "));
    setFError(null);
    setEditOpen(true);
  };

  const toggleSkill = (skillName: string) => {
    setFSkills(prev =>
      prev.includes(skillName) ? prev.filter(s => s !== skillName) : [...prev, skillName]
    );
  };

  return (
    <div className="mx-auto max-w-4xl p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Agents</h1>
          <p className="text-muted-foreground mt-1">Agents available on the connected Cognition server</p>
        </div>
        <Button onClick={() => { resetForm(); setCreateOpen(true); }} className="shrink-0">
          <PlusIcon className="h-4 w-4 mr-2" />New agent
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive flex items-start gap-2">
          <AlertTriangleIcon className="h-4 w-4 mt-0.5 shrink-0" />{error}
        </div>
      )}

      {loading && (
        <div className="grid gap-4 sm:grid-cols-2">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-40 rounded-lg" />)}
        </div>
      )}

      {!loading && !error && agents.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
          <BotIcon className="h-10 w-10 opacity-30" />
          <p>No agents found</p>
        </div>
      )}

      {!loading && agents.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {agents.map(agent => (
            <AgentCard
              key={agent.name}
              agent={agent}
              onEdit={() => openEdit(agent)}
              onDelete={() => handleDelete(agent.name)}
            />
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Create agent</DialogTitle></DialogHeader>
          <AgentForm
            mode="create"
            fName={fName} onNameChange={setFName}
            fDescription={fDescription} onDescriptionChange={setFDescription}
            fMode={fMode} onModeChange={setFMode}
            fSystemPrompt={fSystemPrompt} onSystemPromptChange={setFSystemPrompt}
            fModel={fModel} onModelChange={setFModel}
            fSkills={fSkills} onToggleSkill={toggleSkill}
            fTools={fTools} onToolsChange={setFTools}
            availableSkills={skills}
            error={fError} submitting={submitting}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={submitting}>Cancel</Button>
            <Button onClick={handleCreate} disabled={submitting}>{submitting ? "Creating..." : "Create agent"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit agent: {editingAgent?.name}</DialogTitle></DialogHeader>
          <AgentForm
            mode="edit"
            fName={fName} onNameChange={setFName}
            fDescription={fDescription} onDescriptionChange={setFDescription}
            fMode={fMode} onModeChange={setFMode}
            fSystemPrompt={fSystemPrompt} onSystemPromptChange={setFSystemPrompt}
            fModel={fModel} onModelChange={setFModel}
            fSkills={fSkills} onToggleSkill={toggleSkill}
            fTools={fTools} onToolsChange={setFTools}
            availableSkills={skills}
            error={fError} submitting={submitting}
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

// ── AgentCard ─────────────────────────────────────────────────────────────────

function AgentCard({ agent, onEdit, onDelete }: {
  agent: AgentResponse;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isNative = agent.native;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base">{agent.name}</CardTitle>
          <div className="flex gap-1 shrink-0">
            <ModeBadge mode={agent.mode} />
            {isNative && <Badge variant="outline" className="text-xs">native</Badge>}
          </div>
        </div>
        {agent.description && (
          <CardDescription className="text-xs leading-relaxed line-clamp-2">{agent.description}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-2 text-xs text-muted-foreground">
        {agent.model && (
          <div className="flex items-center gap-1.5">
            <SparklesIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="font-mono">{agent.model}</span>
            {agent.temperature !== null && (
              <span className="opacity-60">· temp {agent.temperature}</span>
            )}
          </div>
        )}
        {agent.tools.length > 0 && (
          <div className="flex items-start gap-1.5">
            <WrenchIcon className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span className="line-clamp-2">{agent.tools.join(", ")}</span>
          </div>
        )}
        {agent.skills.length > 0 && (
          <div className="flex items-start gap-1.5">
            <LightbulbIcon className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <div className="flex flex-wrap gap-1">
              {agent.skills.map(s => (
                <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
              ))}
            </div>
          </div>
        )}
        {agent.system_prompt && (
          <p className="line-clamp-2 italic opacity-60">{agent.system_prompt}</p>
        )}
        <div className="flex gap-2 pt-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={onEdit}>
            <PencilIcon className="h-3.5 w-3.5 mr-1.5" />Edit
          </Button>
          {!isNative && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10">
                  <TrashIcon className="h-3.5 w-3.5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete agent</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete <strong>{agent.name}</strong>? This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={onDelete} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── AgentForm ─────────────────────────────────────────────────────────────────

interface AgentFormProps {
  mode: "create" | "edit";
  fName: string; onNameChange: (v: string) => void;
  fDescription: string; onDescriptionChange: (v: string) => void;
  fMode: "primary" | "subagent" | "all"; onModeChange: (v: "primary" | "subagent" | "all") => void;
  fSystemPrompt: string; onSystemPromptChange: (v: string) => void;
  fModel: string; onModelChange: (v: string) => void;
  fSkills: string[]; onToggleSkill: (name: string) => void;
  fTools: string; onToolsChange: (v: string) => void;
  availableSkills: SkillResponse[];
  error: string | null;
  submitting: boolean;
}

function AgentForm({
  mode, fName, onNameChange, fDescription, onDescriptionChange,
  fMode, onModeChange, fSystemPrompt, onSystemPromptChange,
  fModel, onModelChange, fSkills, onToggleSkill,
  fTools, onToolsChange, availableSkills, error, submitting,
}: AgentFormProps) {
  return (
    <div className="space-y-4 py-4">
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}

      <div className="space-y-2">
        <Label htmlFor="agent-name">
          Name {mode === "create" && <span className="text-destructive">*</span>}
        </Label>
        <Input
          id="agent-name"
          value={fName}
          onChange={e => onNameChange(e.target.value)}
          placeholder="e.g., code-reviewer"
          disabled={submitting || mode === "edit"}
          className={mode === "edit" ? "bg-muted" : ""}
        />
        {mode === "edit" && <p className="text-xs text-muted-foreground">Agent name cannot be changed</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="agent-description">Description</Label>
        <Input
          id="agent-description"
          value={fDescription}
          onChange={e => onDescriptionChange(e.target.value)}
          placeholder="What this agent does"
          disabled={submitting}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="agent-mode">Mode</Label>
        <Select value={fMode} onValueChange={v => onModeChange(v as "primary" | "subagent" | "all")} disabled={submitting}>
          <SelectTrigger id="agent-mode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="primary">Primary — selectable in chat</SelectItem>
            <SelectItem value="subagent">Subagent — invoked by other agents</SelectItem>
            <SelectItem value="all">All — both</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="agent-system-prompt">System prompt</Label>
        <Textarea
          id="agent-system-prompt"
          value={fSystemPrompt}
          onChange={e => onSystemPromptChange(e.target.value)}
          placeholder="You are a helpful assistant..."
          rows={4}
          disabled={submitting}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="agent-model">Model override</Label>
        <Input
          id="agent-model"
          value={fModel}
          onChange={e => onModelChange(e.target.value)}
          placeholder="Leave blank to use provider default"
          disabled={submitting}
          className="font-mono text-sm"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="agent-tools">Tools (comma-separated)</Label>
        <Input
          id="agent-tools"
          value={fTools}
          onChange={e => onToolsChange(e.target.value)}
          placeholder="read_file, write_file, execute_command"
          disabled={submitting}
        />
      </div>

      {availableSkills.length > 0 && (
        <div className="space-y-2">
          <Label>Skills</Label>
          <div className="flex flex-wrap gap-2">
            {availableSkills.map(skill => {
              const active = fSkills.includes(skill.name);
              return (
                <button
                  key={skill.name}
                  type="button"
                  onClick={() => onToggleSkill(skill.name)}
                  disabled={submitting}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-foreground border-border hover:bg-muted"
                  }`}
                >
                  <LightbulbIcon className="h-3 w-3" />
                  {skill.name}
                </button>
              );
            })}
          </div>
          {fSkills.length > 0 && (
            <p className="text-xs text-muted-foreground">{fSkills.length} skill{fSkills.length !== 1 ? "s" : ""} selected</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── ModeBadge ─────────────────────────────────────────────────────────────────

function ModeBadge({ mode }: { mode: AgentResponse["mode"] }) {
  const styles: Record<AgentResponse["mode"], string> = {
    primary: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
    subagent: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    all: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${styles[mode]}`}>
      {mode}
    </span>
  );
}
