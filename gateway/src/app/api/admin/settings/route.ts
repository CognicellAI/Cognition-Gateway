import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db/client";

/** Upsert helper — GatewaySettings is a singleton row with id="default" */
async function getSettings() {
  return db.gatewaySettings.upsert({
    where: { id: "default" },
    create: { id: "default", registrationEnabled: true },
    update: {},
  });
}

/** GET /api/admin/settings — public (used by signup page to gate registration) */
export async function GET(): Promise<NextResponse> {
  const settings = await getSettings();
  return NextResponse.json({ registrationEnabled: settings.registrationEnabled });
}

const patchSchema = z.object({
  registrationEnabled: z.boolean(),
});

/** PATCH /api/admin/settings — admin only */
export async function PATCH(request: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 422 }
    );
  }

  const settings = await db.gatewaySettings.upsert({
    where: { id: "default" },
    create: { id: "default", registrationEnabled: parsed.data.registrationEnabled },
    update: { registrationEnabled: parsed.data.registrationEnabled },
  });

  return NextResponse.json({ registrationEnabled: settings.registrationEnabled });
}
