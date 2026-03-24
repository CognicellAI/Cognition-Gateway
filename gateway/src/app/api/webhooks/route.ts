/**
 * GET  /api/webhooks  — list all webhooks
 * POST /api/webhooks  — create a new webhook
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import { audit, getIp } from "@/lib/gateway/audit";

const createSchema = z.object({
  name: z.string().min(1).max(100),
  path: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-_]+$/, "Path must be lowercase alphanumeric with hyphens/underscores"),
  secret: z.string().min(1).optional(),
  agentName: z.string().min(1),
  promptTemplate: z.string().min(1),
  sessionMode: z.enum(["ephemeral", "persistent"]).default("ephemeral"),
  approvalMode: z.enum(["none", "always"]).default("none"),
  integrationType: z.enum(["github"]).optional(),
  eventType: z.string().min(1).optional(),
  enabled: z.boolean().default(true),
});

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const webhooks = await db.webhook.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      dispatchRuns: {
        where: { sourceType: "webhook" },
        orderBy: { startedAt: "desc" },
        take: 1,
      },
    },
  });

  return NextResponse.json({ webhooks });
}

export async function POST(request: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  // Check for path uniqueness
  const existing = await db.webhook.findUnique({ where: { path: parsed.data.path } });
  if (existing) {
    return NextResponse.json(
      { error: "A webhook with this path already exists" },
      { status: 409 },
    );
  }

  const webhook = await db.webhook.create({
    data: parsed.data,
    include: {
      dispatchRuns: {
        where: { sourceType: "webhook" },
        orderBy: { startedAt: "desc" },
        take: 1,
      },
    },
  });

  await audit({
    userId: session.user.id,
    userEmail: session.user.email ?? undefined,
    action: "webhook.create",
    resource: webhook.id,
    details: { name: webhook.name, path: webhook.path },
    ip: getIp(request),
  });

  return NextResponse.json({ webhook }, { status: 201 });
}
