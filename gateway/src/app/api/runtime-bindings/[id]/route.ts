import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db/client";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const runtimeBindingPatchSchema = z.object({
  runtimeType: z.enum(["docker_compose", "kubernetes", "http_only", "shell", "custom"]).optional(),
  connectionConfig: z.record(z.string(), z.unknown()).optional(),
  lifecyclePolicy: z.record(z.string(), z.unknown()).optional(),
  executionPolicy: z.record(z.string(), z.unknown()).optional(),
  capabilities: z.array(z.string().min(1)).optional(),
  enabled: z.boolean().optional(),
});

export async function PATCH(request: Request, { params }: RouteParams): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const existing = await db.runtimeBinding.findFirst({
    where: {
      id,
      workspaceBinding: {
        userId: session.user.id,
      },
    },
  });

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = runtimeBindingPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const runtimeBinding = await db.runtimeBinding.update({
    where: { id },
    data: {
      runtimeType: parsed.data.runtimeType,
      connectionConfig: parsed.data.connectionConfig ? JSON.stringify(parsed.data.connectionConfig) : undefined,
      lifecyclePolicy: parsed.data.lifecyclePolicy ? JSON.stringify(parsed.data.lifecyclePolicy) : undefined,
      executionPolicy: parsed.data.executionPolicy ? JSON.stringify(parsed.data.executionPolicy) : undefined,
      capabilities: parsed.data.capabilities ? JSON.stringify(parsed.data.capabilities) : undefined,
      enabled: parsed.data.enabled,
    },
    include: {
      workspaceBinding: true,
    },
  });

  return NextResponse.json({ runtimeBinding });
}

export async function DELETE(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const existing = await db.runtimeBinding.findFirst({
    where: {
      id,
      workspaceBinding: {
        userId: session.user.id,
      },
    },
  });

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.runtimeBinding.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
