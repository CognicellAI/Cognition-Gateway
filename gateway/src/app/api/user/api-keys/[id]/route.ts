/**
 * DELETE /api/user/api-keys/[id]  — revoke an API key
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import { audit, getIp } from "@/lib/gateway/audit";

interface RouteParams {
  params: Promise<{ id: string }>;
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

  // Only allow deleting own keys (admins cannot delete other users' keys here —
  // that's a future RBAC concern)
  const key = await db.apiKey.findFirst({
    where: { id, userId: session.user.id },
  });

  if (!key) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.apiKey.delete({ where: { id } });

  await audit({
    userId: session.user.id,
    userEmail: session.user.email ?? undefined,
    action: "apikey.delete",
    resource: id,
    details: { name: key.name },
    ip: getIp(request),
  });

  return new NextResponse(null, { status: 204 });
}
