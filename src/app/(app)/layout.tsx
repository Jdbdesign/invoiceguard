import { Sidebar } from "@/components/layout/Sidebar";
import { AppDataProvider } from "@/context/AppDataContext";
import { auth } from "@/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const userEmail = session?.user?.email ?? "";

  return (
    <AppDataProvider>
      <div className="flex h-screen overflow-hidden bg-slate-50">
        <Sidebar userEmail={userEmail} />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-6xl px-8 py-8">{children}</div>
        </main>
      </div>
    </AppDataProvider>
  );
}
