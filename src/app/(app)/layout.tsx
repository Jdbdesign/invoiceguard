import { AppShell } from "@/components/layout/AppShell";
import { AppDataProvider } from "@/context/AppDataContext";
import { auth } from "@/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const userEmail = session?.user?.email ?? "";

  return (
    <AppDataProvider>
      <AppShell userEmail={userEmail}>{children}</AppShell>
    </AppDataProvider>
  );
}
