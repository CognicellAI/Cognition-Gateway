import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db/client";

const runtimeBindingSchema = z.object({
  workspaceBindingId: z.string().min(1),
  runtimeType: z.enum(["docker_compose", "kubernetes", "http_only", "shell", "custom"]),
  connectionConfig: z.record(z.string(), z.unknown()).default({}),
  lifecyclePolicy: z.record(z.string(), z.unknown()).default({}),
  executionPolicy: z.record(z.string(), z.unknown()).default({}),
  capabilities: z.array(z.string().min(1)).default([]),
  enabled: z.boolean().default(true),
});

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const runtimeBindings = await db.runtimeBinding.findMany({
    where: {
      workspaceBinding: {
        userId: session.user.id,
      },
    },
    include: {
      workspaceBinding: true,
    },
    orderBy: [{ runtimeType: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json({ runtimeBindings });
}

export async function POST(request: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = runtimeBindingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const workspaceBinding = await db.workspaceBinding.findFirst({
    where: {
      id: parsed.data.workspaceBindingId,
      userId: session.user.id,
    },
  });

  if (!workspaceBinding) {
    return NextResponse.json({ error: "Workspace binding not found" }, { status: 404 });
  }

  const runtimeBinding = await db.runtimeBinding.create({
    data: {
      workspaceBindingId: parsed.data.workspaceBindingId,
      runtimeType: parsed.data.runtimeType,
      connectionConfig: JSON.stringify(parsed.data.connectionConfig),
      lifecyclePolicy: JSON.stringify(parsed.data.lifecyclePolicy),
      executionPolicy: JSON.stringify(parsed.data.executionPolicy),
      capabilities: JSON.stringify(parsed.data.capabilities),
      enabled: parsed.data.enabled,
    },
    include: {
      workspaceBinding: true,
    },
  });

  return NextResponse.json({ runtimeBinding }, { status: 201 });
}
