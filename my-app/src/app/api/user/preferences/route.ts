import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db/client";

const PreferencesSchema = z.object({
  theme: z.enum(["light", "dark", "system"]).optional(),
  defaultAgent: z.string().optional(),
});

type Preferences = z.infer<typeof PreferencesSchema>;

function parsePreferences(raw: string): Preferences {
  try {
    return PreferencesSchema.parse(JSON.parse(raw));
  } catch {
    return {};
  }
}

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { preferences: true },
  });

  const prefs = parsePreferences(user?.preferences ?? "{}");
  return NextResponse.json(prefs);
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = PreferencesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 422 }
    );
  }

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { preferences: true },
  });
  const existing = parsePreferences(user?.preferences ?? "{}");
  const merged: Preferences = { ...existing, ...parsed.data };

  await db.user.update({
    where: { id: session.user.id },
    data: { preferences: JSON.stringify(merged) },
  });

  return NextResponse.json(merged);
}
