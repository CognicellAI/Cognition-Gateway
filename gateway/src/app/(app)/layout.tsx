import { auth } from "@/lib/auth/config";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <AppShell role={session.user.role}>
      {children}
    </AppShell>
  );
}