import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db/client";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const workspaceBindingPatchSchema = z.object({
  scopeType: z.string().min(1).max(64).optional(),
  scopeKey: z.string().min(1).max(255).optional(),
  workspacePath: z.string().min(1).max(1024).optional(),
  repoRoot: z.string().min(1).max(1024).optional().nullable(),
  defaultBranch: z.string().min(1).max(255).optional().nullable(),
  envProfile: z.string().min(1).max(255).optional().nullable(),
  enabled: z.boolean().optional(),
});

export async function PATCH(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const existing = await db.workspaceBinding.findFirst({
    where: { id, userId: session.user.id },
  });

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = workspaceBindingPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const nextScopeType = parsed.data.scopeType ?? existing.scopeType;
  const nextScopeKey = parsed.data.scopeKey ?? existing.scopeKey;
  const scopeConflict = await db.workspaceBinding.findUnique({
    where: {
      userId_scopeType_scopeKey: {
        userId: session.user.id,
        scopeType: nextScopeType,
        scopeKey: nextScopeKey,
      },
    },
  });

  if (scopeConflict && scopeConflict.id !== id) {
    return NextResponse.json(
      { error: "A workspace binding for this scope already exists" },
      { status: 409 },
    );
  }

  const workspaceBinding = await db.workspaceBinding.update({
    where: { id },
    data: {
      scopeType: parsed.data.scopeType,
      scopeKey: parsed.data.scopeKey,
      workspacePath: parsed.data.workspacePath,
      repoRoot: parsed.data.repoRoot,
      defaultBranch: parsed.data.defaultBranch,
      envProfile: parsed.data.envProfile,
      enabled: parsed.data.enabled,
    },
  });

  return NextResponse.json({ workspaceBinding });
}

export async function DELETE(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const existing = await db.workspaceBinding.findFirst({
    where: { id, userId: session.user.id },
  });

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.workspaceBinding.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
