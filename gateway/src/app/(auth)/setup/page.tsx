import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import SetupClient from "./setup-client";

// Always server-render — queries the DB for first-run detection
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const userCount = await db.user.count();
  if (userCount > 0) {
    redirect("/login");
  }

  return <SetupClient />;
}
