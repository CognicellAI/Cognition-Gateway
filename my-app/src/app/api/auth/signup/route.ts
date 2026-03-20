import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { z } from "zod";
import { db } from "@/lib/db/client";

const signUpSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1, "Name is required").optional(),
});

export async function POST(request: Request): Promise<NextResponse> {
  // Check if registration is enabled — DB setting takes precedence over env var
  const envEnabled = process.env.REGISTRATION_ENABLED !== "false";
  const dbSettings = await db.gatewaySettings.findUnique({ where: { id: "default" } });
  const registrationEnabled = dbSettings ? dbSettings.registrationEnabled : envEnabled;
  if (!registrationEnabled) {
    return NextResponse.json(
      { error: "Registration is disabled", code: "REGISTRATION_DISABLED" },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = signUpSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 }
    );
  }

  const { email, password, name } = parsed.data;

  // Check for existing user
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: "An account with this email already exists", code: "EMAIL_TAKEN" },
      { status: 409 }
    );
  }

  // First user becomes admin
  const userCount = await db.user.count();
  const role = userCount === 0 ? "admin" : "user";

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await db.user.create({
    data: {
      email,
      name: name ?? null,
      passwordHash,
      role,
    },
    select: { id: true, email: true, name: true, role: true },
  });

  return NextResponse.json(user, { status: 201 });
}