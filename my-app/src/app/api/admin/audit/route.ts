/**
 * GET /api/admin/audit  — paginated audit log (admin only)
 *
 * Query params:
 *   page      (default 1)
 *   limit     (default 50, max 200)
 *   userId    filter by user ID
 *   action    filter by action string (prefix match)
 *   from      ISO date — createdAt >=
 *   to        ISO date — createdAt <=
 *   format    "csv" to download as CSV
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db/client";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  userId: z.string().optional(),
  action: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  format: z.enum(["json", "csv"]).default("json"),
});

export async function GET(request: Request): Promise<Response> {
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
      { error: "Invalid query params", details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const { page, limit, userId, action, from, to, format } = parsed.data;

  const where = {
    ...(userId ? { userId } : {}),
    ...(action ? { action: { startsWith: action } } : {}),
    ...((from ?? to)
      ? {
          createdAt: {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lte: new Date(to) } : {}),
          },
        }
      : {}),
  };

  const [logs, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.auditLog.count({ where }),
  ]);

  if (format === "csv") {
    const header = "id,userId,userEmail,action,resource,details,ip,createdAt\n";
    const rows = logs
      .map((l) =>
        [
          l.id,
          l.userId ?? "",
          l.userEmail ?? "",
          l.action,
          l.resource ?? "",
          l.details ? JSON.stringify(l.details).replace(/"/g, '""') : "",
          l.ip ?? "",
          l.createdAt.toISOString(),
        ]
          .map((v) => `"${v}"`)
          .join(","),
      )
      .join("\n");

    return new Response(header + rows, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="audit-${Date.now()}.csv"`,
      },
    });
  }

  return NextResponse.json({
    logs,
    total,
    page,
    pages: Math.ceil(total / limit),
  });
}
