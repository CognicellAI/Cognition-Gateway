import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import { audit, getIp } from "@/lib/gateway/audit";

const createSchema = z.object({
  name: z.string().min(1).max(100),
  integrationType: z.enum(["github"]),
  eventType: z.string().min(1),
  actionFilter: z.string().min(1).optional(),
  resourceType: z.string().min(1).optional(),
  runIntent: z.enum(["triage", "investigate", "implement", "review", "notify"]).optional(),
  agentName: z.string().min(1),
  promptTemplate: z.string().min(1),
  contextKeyTemplate: z.string().min(1).optional(),
  approvalMode: z.enum(["none", "always"]).default("none"),
  enabled: z.boolean().default(true),
});

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rules = await db.dispatchRule.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({ rules });
}

export async function POST(request: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 422 }
    );
  }

  const rule = await db.dispatchRule.create({ data: parsed.data });

  await audit({
    userId: session.user.id,
    userEmail: session.user.email ?? undefined,
    action: "dispatch_rule.create",
    resource: rule.id,
    details: {
      integrationType: rule.integrationType,
      eventType: rule.eventType,
      actionFilter: rule.actionFilter,
      resourceType: rule.resourceType,
      runIntent: rule.runIntent,
    },
    ip: getIp(request),
  });

  return NextResponse.json({ rule }, { status: 201 });
}
