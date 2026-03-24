/**
 * POST /api/hooks/[...path]  — webhook ingress
 *
 * Accepts inbound webhook calls, validates HMAC signature if configured,
 * and triggers the corresponding agent session asynchronously.
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { handleWebhookInvocation } from "@/lib/gateway/webhooks";

interface RouteParams {
  params: Promise<{ path: string[] }>;
}

export async function POST(
  request: Request,
  { params }: RouteParams,
): Promise<NextResponse> {
  console.log("[hooks] Ingress hit for POST");
  const { path: segments } = await params;
  const path = segments.join("/");

  // Read raw body for HMAC validation
  const rawBody = await request.text();
  const signatureHeader = request.headers.get("X-Hub-Signature-256");
  const eventHeader = request.headers.get("X-GitHub-Event") ?? request.headers.get("x-github-event");

  // Parse JSON body (best-effort)
  let body: unknown = rawBody;
  try {
    body = JSON.parse(rawBody);
  } catch {
    // Not JSON — pass raw string as body
  }

  const sourceIp =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  const g = globalThis as unknown as {
    wsBroadcast?: (m: unknown) => void;
    cognitionServerUrl?: string;
  };

  const result = await handleWebhookInvocation(
    path,
    body,
    rawBody,
    signatureHeader,
    eventHeader,
    sourceIp,
    {
      db,
      serverUrl: g.cognitionServerUrl ?? process.env.COGNITION_SERVER_URL ?? "http://localhost:8000",
      broadcast: g.wsBroadcast ?? (() => undefined),
      scopeUserId: undefined,
    },
  );

  return NextResponse.json({ message: result.message }, { status: result.httpStatus });
}
