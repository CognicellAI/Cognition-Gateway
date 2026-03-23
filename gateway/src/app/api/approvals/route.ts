import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import { executeApprovedDispatchRun } from "@/lib/gateway/approval-runner";

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const runs = await db.dispatchRun.findMany({
    where: {
      approvalRequired: true,
      status: "awaiting_approval",
    },
    orderBy: { startedAt: "desc" },
    take: 100,
  });

  return NextResponse.json({ runs });
}

export async function POST(request: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    runId?: string;
    action?: "approve" | "reject";
  };

  if (!body.runId || !body.action) {
    return NextResponse.json({ error: "runId and action are required" }, { status: 400 });
  }

  const run = await db.dispatchRun.findUnique({ where: { id: body.runId } });
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const status = body.action === "approve" ? "queued" : "rejected";

  const updated = await db.dispatchRun.update({
    where: { id: body.runId },
    data: {
      status,
      finishedAt: body.action === "reject" ? new Date() : null,
    },
  });

  if (body.action === "approve") {
    const g = globalThis as unknown as {
      wsBroadcast?: (m: unknown) => void;
      cognitionServerUrl?: string;
    };

    await executeApprovedDispatchRun(body.runId, {
      db,
      serverUrl: g.cognitionServerUrl ?? process.env.COGNITION_SERVER_URL ?? "http://localhost:8000",
      broadcast: g.wsBroadcast ?? (() => undefined),
      scopeUserId: "gateway-automation",
    });
  }

  return NextResponse.json({ run: updated });
}
