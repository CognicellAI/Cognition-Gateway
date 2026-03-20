/**
 * POST /api/cron/jobs  — create a new cron job
 * GET  /api/cron/jobs  — list all cron jobs with latest run
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import { audit, getIp } from "@/lib/gateway/audit";

// Minimal cron validation — full validation happens in Croner at register time
const createSchema = z.object({
  name: z.string().min(1).max(100),
  schedule: z.string().min(1),
  agentName: z.string().min(1),
  prompt: z.string().min(1),
  sessionMode: z.enum(["ephemeral", "persistent"]).default("ephemeral"),
  deliveryMode: z.enum(["none", "webhook"]).default("none"),
  deliveryTarget: z.string().url().optional(),
  enabled: z.boolean().default(true),
});

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jobs = await db.cronJob.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      runs: {
        orderBy: { startedAt: "desc" },
        take: 1,
      },
    },
  });

  return NextResponse.json({ jobs });
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

  const job = await db.cronJob.create({ data: parsed.data });

  await audit({
    userId: session.user.id,
    userEmail: session.user.email ?? undefined,
    action: "cron.create",
    resource: job.id,
    details: { name: job.name, schedule: job.schedule },
    ip: getIp(request),
  });

  // Register in the live scheduler if enabled
  if (job.enabled) {
    const g = globalThis as unknown as {
      cronRegisterJob?: (id: string, schedule: string, ctx: { db: typeof db; serverUrl: string; broadcast: (m: unknown) => void }) => void;
      wsBroadcast?: (m: unknown) => void;
      cognitionServerUrl?: string;
    };
    if (g.cronRegisterJob) {
      g.cronRegisterJob(job.id, job.schedule, {
        db,
        serverUrl: g.cognitionServerUrl ?? process.env.COGNITION_SERVER_URL ?? "http://localhost:8000",
        broadcast: g.wsBroadcast ?? (() => undefined),
      });
    }
  }

  return NextResponse.json({ job }, { status: 201 });
}
