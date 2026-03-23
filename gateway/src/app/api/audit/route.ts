/**
 * GET /api/audit  — paginated audit log with optional filters
 *
 * Query params:
 *   page     — 1-indexed page number (default: 1)
 *   limit    — records per page (default: 50, max: 200)
 *   action   — filter by action string (exact match)
 *   userId   — filter by userId
 *   resource — filter by resource string
 *
 * Admin-only endpoint.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db/client";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  action: z.string().optional(),
  userId: z.string().optional(),
  resource: z.string().optional(),
});

export async function GET(request: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const rawParams = Object.fromEntries(url.searchParams.entries());
  const parsed = querySchema.safeParse(rawParams);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query parameters", details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const { page, limit, action, userId, resource } = parsed.data;
  const skip = (page - 1) * limit;

  const where = {
    ...(action ? { action } : {}),
    ...(userId ? { userId } : {}),
    ...(resource ? { resource } : {}),
  };

  const [total, logs] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
  ]);

  return NextResponse.json({
    logs,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  });
}
