"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { SessionProvider, useSession } from "@/lib/session";
import { BottomNav } from "@/components/BottomNav";
import { Sidebar } from "@/components/Sidebar";
import { Onboarding } from "@/components/Onboarding";
import { initNative } from "@/lib/native";
import { Loader2 } from "lucide-react";

function Shell({ children }: { children: React.ReactNode }) {
  const { loading, ctx } = useSession();
  const pathname = usePathname();
  useEffect(() => {
    initNative();
  }, []);

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
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl bg-[var(--bg)]">
      <Sidebar className="sticky top-0 hidden h-dvh md:flex" />
      <div className="flex min-h-dvh w-full flex-1 flex-col md:border-r md:border-[var(--border)]">
        <main key={pathname} className="page-enter flex flex-1 flex-col">{children}</main>
        <div className="md:hidden">
          <BottomNav />
        </div>
      </div>
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
