"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { LightbulbIcon, PlusIcon, PencilIcon, TrashIcon, FileTextIcon, AlertTriangleIcon } from "lucide-react";
import type { SkillResponse, SkillCreate, SkillUpdate } from "@/types/cognition";

function parseApiError(body: unknown): string {
  if (typeof body !== "object" || body === null) return "Request failed";
  const b = body as Record<string, unknown>;
  if (typeof b.detail === "string") return b.detail;
  if (Array.isArray(b.detail)) return b.detail.map((d: {msg?: string}) => d.msg ?? String(d)).join("; ");
  return "Request failed";
}

function generateContent(name: string, description: string): string {
  return `---
name: ${name || "skill-name"}
description: ${description || "A brief description of this skill"}
---

# ${name || "Skill Name"}

Add instructions here. This content is injected into the agent's system prompt when this skill is active.
`;
}

export default function SkillsPage() {
  const [skills, setSkills] = useState<SkillResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<SkillResponse | null>(null);

  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchSkills = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/c/skills");
      if (!res.ok) throw new Error(`Server responded ${res.status}`);
      const data = await res.json();
      setSkills(data.skills ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load skills");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSkills(); }, [fetchSkills]);

  const resetForm = () => {
    setFormName(""); setFormDescription(""); setFormContent(""); setFormError(null);
  };

  const handleCreate = async () => {
    if (!formName.trim()) { setFormError("Name is required"); return; }
    setSubmitting(true); setFormError(null);

    const content = formContent.trim() || generateContent(formName, formDescription);
    const payload: SkillCreate = {
      name: formName.trim(),
      description: formDescription.trim() || undefined,
      content,
    };

    try {
      const res = await fetch("/api/c/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(parseApiError(await res.json().catch(() => ({}))));
      setCreateOpen(false); resetForm(); await fetchSkills();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Failed to create skill");
    } finally { setSubmitting(false); }
  };

  const handleEdit = async () => {
    if (!editingSkill) return;
    setSubmitting(true); setFormError(null);

    const payload: SkillUpdate = {
      description: formDescription.trim() || undefined,
      content: formContent.trim() || undefined,
    };

    try {
      const res = await fetch(`/api/c/skills/${encodeURIComponent(editingSkill.name)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(parseApiError(await res.json().catch(() => ({}))));
      setEditOpen(false); setEditingSkill(null); resetForm(); await fetchSkills();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Failed to update skill");
    } finally { setSubmitting(false); }
  };

  const handleDelete = async (name: string) => {
    try {
      const res = await fetch(`/api/c/skills/${encodeURIComponent(name)}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error(parseApiError(await res.json().catch(() => ({}))));
      await fetchSkills();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to delete skill");
    }
  };

  const openEdit = (skill: SkillResponse) => {
    setEditingSkill(skill);
    setFormName(skill.name);
    setFormDescription(skill.description ?? "");
    setFormContent(skill.content ?? "");
    setFormError(null);
    setEditOpen(true);
  };

  return (
    <div className="mx-auto max-w-4xl p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Skills</h1>
          <p className="text-muted-foreground mt-1">Reusable capabilities that can be assigned to agents</p>
        </div>
        <Button onClick={() => { resetForm(); setCreateOpen(true); }} className="shrink-0">
          <PlusIcon className="h-4 w-4 mr-2" />New skill
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive flex items-start gap-2">
          <AlertTriangleIcon className="h-4 w-4 mt-0.5 shrink-0" />{error}
        </div>
      )}

      {loading && (
        <div className="grid gap-4 sm:grid-cols-2">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 rounded-lg" />)}
        </div>
      )}

      {!loading && !error && skills.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
          <LightbulbIcon className="h-10 w-10 opacity-30" />
          <p>No skills found</p>
          <p className="text-sm">Create a skill to get started</p>
        </div>
      )}

      {!loading && skills.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {skills.map(skill => (
            <SkillCard key={skill.name} skill={skill} onEdit={() => openEdit(skill)} onDelete={() => handleDelete(skill.name)} />
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Create skill</DialogTitle></DialogHeader>
          <SkillForm
            mode="create"
            name={formName} onNameChange={setFormName}
            description={formDescription} onDescriptionChange={setFormDescription}
            content={formContent} onContentChange={setFormContent}
            error={formError} submitting={submitting}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={submitting}>Cancel</Button>
            <Button onClick={handleCreate} disabled={submitting}>{submitting ? "Creating..." : "Create skill"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit skill: {editingSkill?.name}</DialogTitle></DialogHeader>
          <SkillForm
            mode="edit"
            name={formName} onNameChange={setFormName}
            description={formDescription} onDescriptionChange={setFormDescription}
            content={formContent} onContentChange={setFormContent}
            error={formError} submitting={submitting}
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

function SkillCard({ skill, onEdit, onDelete }: { skill: SkillResponse; onEdit: () => void; onDelete: () => void; }) {
  const isBuiltin = skill.source === "builtin" || skill.source === "file";

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base">{skill.name}</CardTitle>
          <div className="flex gap-1 shrink-0">
            {skill.content && (
              <Badge variant="secondary" className="text-xs">
                <FileTextIcon className="h-3 w-3 mr-1" />content
              </Badge>
            )}
            {skill.source && <Badge variant="outline" className="text-xs">{skill.source}</Badge>}
            {!skill.enabled && <Badge variant="outline" className="text-xs opacity-60">disabled</Badge>}
          </div>
        </div>
        {skill.description && (
          <CardDescription className="text-xs leading-relaxed line-clamp-2">{skill.description}</CardDescription>
        )}
      </CardHeader>
      {!isBuiltin && (
        <CardContent>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={onEdit}>
              <PencilIcon className="h-3.5 w-3.5 mr-1.5" />Edit
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10">
                  <TrashIcon className="h-3.5 w-3.5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete skill</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete <strong>{skill.name}</strong>? This cannot be undone.
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
      )}
    </Card>
  );
}

function SkillForm({
  mode, name, onNameChange, description, onDescriptionChange,
  content, onContentChange, error, submitting,
}: {
  mode: "create" | "edit";
  name: string; onNameChange: (v: string) => void;
  description: string; onDescriptionChange: (v: string) => void;
  content: string; onContentChange: (v: string) => void;
  error: string | null; submitting: boolean;
}) {
  return (
    <div className="space-y-4 py-4">
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}
      <div className="space-y-2">
        <Label htmlFor="skill-name">
          Name {mode === "create" && <span className="text-destructive">*</span>}
        </Label>
        <Input
          id="skill-name"
          value={name}
          onChange={e => onNameChange(e.target.value)}
          placeholder="e.g., code-review"
          disabled={submitting || mode === "edit"}
          className={mode === "edit" ? "bg-muted" : ""}
        />
        {mode === "edit" && <p className="text-xs text-muted-foreground">Skill name cannot be changed</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="skill-description">Description</Label>
        <Input
          id="skill-description"
          value={description}
          onChange={e => onDescriptionChange(e.target.value)}
          placeholder="What this skill enables agents to do"
          disabled={submitting}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="skill-content">SKILL.md Content</Label>
        <p className="text-xs text-muted-foreground">
          Full skill content with YAML frontmatter and instructions. Auto-generated from name/description if left empty.
        </p>
        <Textarea
          id="skill-content"
          value={content}
          onChange={e => onContentChange(e.target.value)}
          placeholder={generateContent(name, description)}
          rows={12}
          disabled={submitting}
          className="font-mono text-sm"
        />
      </div>
    </div>
  );
}
