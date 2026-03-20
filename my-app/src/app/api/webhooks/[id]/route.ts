/**
 * GET    /api/webhooks/[id]  — get webhook details with invocation history
 * PATCH  /api/webhooks/[id]  — update webhook
 * DELETE /api/webhooks/[id]  — delete webhook
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import { audit, getIp } from "@/lib/gateway/audit";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  secret: z.string().min(1).optional().nullable(),
  agentName: z.string().min(1).optional(),
  promptTemplate: z.string().min(1).optional(),
  sessionMode: z.enum(["ephemeral", "persistent"]).optional(),
  enabled: z.boolean().optional(),
});

export async function GET(
  _request: Request,
  { params }: RouteParams,
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const webhook = await db.webhook.findUnique({
    where: { id },
    include: {
      invocations: { orderBy: { startedAt: "desc" }, take: 50 },
    },
  });

  if (!webhook) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ webhook });
}

export async function PATCH(
  request: Request,
  { params }: RouteParams,
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const existing = await db.webhook.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const webhook = await db.webhook.update({ where: { id }, data: parsed.data });

  await audit({
    userId: session.user.id,
    userEmail: session.user.email ?? undefined,
    action: "webhook.update",
    resource: id,
    details: { name: webhook.name },
    ip: getIp(request),
  });

  return NextResponse.json({ webhook });
}

export async function DELETE(
  request: Request,
  { params }: RouteParams,
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const existing = await db.webhook.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.webhook.delete({ where: { id } });

  await audit({
    userId: session.user.id,
    userEmail: session.user.email ?? undefined,
    action: "webhook.delete",
    resource: id,
    details: { name: existing.name },
    ip: getIp(request),
  });

  return new NextResponse(null, { status: 204 });
}
