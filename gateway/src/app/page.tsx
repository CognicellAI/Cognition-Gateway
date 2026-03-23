import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { auth } from "@/lib/auth/config";

// Always server-render — queries the DB to check first-run state
export const dynamic = "force-dynamic";

export default async function RootPage() {
  const userCount = await db.user.count();
  if (userCount === 0) {
    redirect("/setup");
  }

  const session = await auth();
  if (!session) {
    redirect("/login");
  }

  redirect("/chat");
}
