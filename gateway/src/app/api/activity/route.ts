import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db/client";

export async function GET(request: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const sourceType = searchParams.get("sourceType");
  const status = searchParams.get("status");
  const approvalOnly = searchParams.get("approvalOnly") === "true";

  const runs = await db.dispatchRun.findMany({
    where: {
      ...(sourceType && sourceType !== "all" ? { sourceType } : {}),
      ...(status && status !== "all" ? { status } : {}),
      ...(approvalOnly ? { approvalRequired: true } : {}),
    },
    orderBy: { startedAt: "desc" },
    take: 100,
  });

  return NextResponse.json({ runs });
}
