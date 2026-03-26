import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db/client";

const workspaceBindingSchema = z.object({
  scopeType: z.string().min(1).max(64),
  scopeKey: z.string().min(1).max(255),
  workspacePath: z.string().min(1).max(1024),
  repoRoot: z.string().min(1).max(1024).optional().nullable(),
  defaultBranch: z.string().min(1).max(255).optional().nullable(),
  envProfile: z.string().min(1).max(255).optional().nullable(),
  enabled: z.boolean().default(true),
});

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspaceBindings = await db.workspaceBinding.findMany({
    where: { userId: session.user.id },
    orderBy: [{ scopeType: "asc" }, { scopeKey: "asc" }],
  });

  return NextResponse.json({ workspaceBindings });
}

export async function POST(request: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = workspaceBindingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const existing = await db.workspaceBinding.findUnique({
    where: {
      userId_scopeType_scopeKey: {
        userId: session.user.id,
        scopeType: parsed.data.scopeType,
        scopeKey: parsed.data.scopeKey,
      },
    },
  });

  if (existing) {
    return NextResponse.json(
      { error: "A workspace binding for this scope already exists" },
      { status: 409 },
    );
  }

  const workspaceBinding = await db.workspaceBinding.create({
    data: {
      userId: session.user.id,
      scopeType: parsed.data.scopeType,
      scopeKey: parsed.data.scopeKey,
      workspacePath: parsed.data.workspacePath,
      repoRoot: parsed.data.repoRoot ?? null,
      defaultBranch: parsed.data.defaultBranch ?? null,
      envProfile: parsed.data.envProfile ?? null,
      enabled: parsed.data.enabled,
    },
  });

  return NextResponse.json({ workspaceBinding }, { status: 201 });
}
