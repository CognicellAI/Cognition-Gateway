import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import {
  markDispatchRunError,
  markDispatchRunSuccess,
  parseCallbackOutcome,
  type DispatchCallbackPayload,
} from "@/lib/gateway/dispatch";

export async function POST(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const run = await db.dispatchRun.findFirst({
    where: { callbackToken: token },
    select: { id: true },
  });

  if (!run) {
    return NextResponse.json({ error: "Dispatch run not found" }, { status: 404 });
  }

  const payload = (await request.json()) as DispatchCallbackPayload;
  const outcome = parseCallbackOutcome(payload);

  if (outcome.error) {
    await markDispatchRunError(db, run.id, {
      sessionId: outcome.sessionId,
      error: outcome.error,
    });
  } else {
    await markDispatchRunSuccess(db, run.id, {
      sessionId: outcome.sessionId ?? "",
      output: outcome.output,
      tokenUsage: outcome.tokenUsage,
    });
  }

  return NextResponse.json({ ok: true });
}
