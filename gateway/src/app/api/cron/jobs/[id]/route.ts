/**
 * GET    /api/cron/jobs/[id]  — get job details with run history
 * PATCH  /api/cron/jobs/[id]  — update job
 * DELETE /api/cron/jobs/[id]  — delete job
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
  schedule: z.string().min(1).optional(),
  agentName: z.string().min(1).optional(),
  prompt: z.string().min(1).optional(),
  sessionMode: z.enum(["ephemeral", "persistent"]).optional(),
  deliveryMode: z.enum(["none", "webhook"]).optional(),
  deliveryTarget: z.string().url().optional().nullable(),
  approvalMode: z.enum(["none", "always"]).optional(),
  enabled: z.boolean().optional(),
});

function getScheduler() {
  return globalThis as unknown as {
    cronRegisterJob?: (id: string, schedule: string, ctx: { db: typeof db; serverUrl: string; broadcast: (m: unknown) => void }) => void;
    cronUnregisterJob?: (id: string) => void;
    wsBroadcast?: (m: unknown) => void;
    cognitionServerUrl?: string;
  };
}

export async function GET(
  _request: Request,
  { params }: RouteParams,
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const job = await db.cronJob.findUnique({
    where: { id },
    include: {
      dispatchRuns: {
        where: { sourceType: "cron" },
        orderBy: { startedAt: "desc" },
        take: 20,
      },
    },
  });

  if (!job) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ job });
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

  const existing = await db.cronJob.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const job = await db.cronJob.update({
    where: { id },
    data: parsed.data,
    include: {
      dispatchRuns: {
        where: { sourceType: "cron" },
        orderBy: { startedAt: "desc" },
        take: 20,
      },
    },
  });

  await audit({
    userId: session.user.id,
    userEmail: session.user.email ?? undefined,
    action: "cron.update",
    resource: id,
    details: { name: job.name },
    ip: getIp(request),
  });

  // Re-register in scheduler
  const g = getScheduler();
  if (g.cronUnregisterJob) g.cronUnregisterJob(id);
  if (job.enabled && g.cronRegisterJob) {
    g.cronRegisterJob(job.id, job.schedule, {
      db,
      serverUrl: g.cognitionServerUrl ?? process.env.COGNITION_SERVER_URL ?? "http://localhost:8000",
      broadcast: g.wsBroadcast ?? (() => undefined),
    });
  }

  return NextResponse.json({ job });
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
  const existing = await db.cronJob.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Unregister from scheduler first
  const g = getScheduler();
  if (g.cronUnregisterJob) g.cronUnregisterJob(id);

  await db.cronJob.delete({ where: { id } });

  await audit({
    userId: session.user.id,
    userEmail: session.user.email ?? undefined,
    action: "cron.delete",
    resource: id,
    details: { name: existing.name },
    ip: getIp(request),
  });

  return new NextResponse(null, { status: 204 });
}
