import { Suspense } from "react";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import LoginClient from "./login-client";

// Always server-render — queries the DB for first-run detection
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const userCount = await db.user.count();
  if (userCount === 0) {
    redirect("/setup");
  }

  return (
    <Suspense>
      <LoginClient />
    </Suspense>
  );
}
