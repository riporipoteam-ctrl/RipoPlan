"use client";

import { SessionProvider, useSession } from "@/lib/session";
import { BottomNav } from "@/components/BottomNav";
import { Onboarding } from "@/components/Onboarding";
import { Loader2 } from "lucide-react";

function Shell({ children }: { children: React.ReactNode }) {
  const { loading, ctx } = useSession();

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[var(--bg)] text-[var(--muted)]">
        <Loader2 className="animate-spin" />
      </div>
    );
  }
  if (!ctx) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[var(--bg)] text-sm text-[var(--muted)]">
        Redirecting…
      </div>
    );
  }
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
      <Onboarding />
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <Shell>{children}</Shell>
    </SessionProvider>
  );
}
