import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import bcrypt from "bcrypt";
import { z } from "zod";

const setupSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  serverUrl: z
    .string()
    .url("Invalid server URL")
    .default("http://localhost:8000"),
});

/** GET /api/setup — returns { needsSetup: boolean } */
export async function GET(): Promise<NextResponse> {
  const count = await db.user.count();
  return NextResponse.json({ needsSetup: count === 0 });
}

/** POST /api/setup — creates the first admin user */
export async function POST(request: Request): Promise<NextResponse> {
  // Only allow setup if no users exist
  const count = await db.user.count();
  if (count > 0) {
    return NextResponse.json(
      { error: "Setup has already been completed" },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = setupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 422 }
    );
  }

  const { name, email, password, serverUrl } = parsed.data;

  const existingUser = await db.user.findUnique({ where: { email } });
  if (existingUser) {
    return NextResponse.json(
      { error: "An account with that email already exists" },
      { status: 409 }
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await db.user.create({
    data: {
      name,
      email,
      passwordHash,
      role: "admin",
      serverUrl,
    },
  });

  return NextResponse.json({ success: true }, { status: 201 });
}
