import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/data";
import { BottomNav } from "@/components/BottomNav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  if (!ctx.workspace) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-8 text-center text-sm text-[var(--muted)]">
        Setting up your workspace… refresh in a moment.
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col bg-[var(--bg)]">
      <main className="flex flex-1 flex-col">{children}</main>
      <BottomNav />
    </div>
  );
}
