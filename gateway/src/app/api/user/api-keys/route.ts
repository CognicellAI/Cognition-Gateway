/**
 * GET  /api/user/api-keys  — list the current user's API keys (no hashes)
 * POST /api/user/api-keys  — create a new API key (returns full key ONCE)
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import { generateApiKey, hashApiKey } from "@/lib/auth/api-keys";
import { audit, getIp } from "@/lib/gateway/audit";

const createSchema = z.object({
  name: z.string().min(1).max(100),
  expiresAt: z.string().datetime().optional(), // ISO date string
});

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const keys = await db.apiKey.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      expiresAt: true,
      lastUsedAt: true,
      createdAt: true,
      // Never return keyHash
    },
  });

  return NextResponse.json({ keys });
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

  const { fullKey, prefix } = generateApiKey();
  const keyHash = await hashApiKey(fullKey);

  const apiKey = await db.apiKey.create({
    data: {
      userId: session.user.id,
      name: parsed.data.name,
      keyHash,
      keyPrefix: prefix,
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
    },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      expiresAt: true,
      createdAt: true,
    },
  });

  await audit({
    userId: session.user.id,
    userEmail: session.user.email ?? undefined,
    action: "apikey.create",
    resource: apiKey.id,
    details: { name: apiKey.name },
    ip: getIp(request),
  });

  // Return the full key ONCE — not stored, cannot be retrieved again
  return NextResponse.json({ apiKey, fullKey }, { status: 201 });
}
