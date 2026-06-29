"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { SessionProvider, useSession } from "@/lib/session";
import { BottomNav } from "@/components/BottomNav";
import { Sidebar } from "@/components/Sidebar";
import { Onboarding } from "@/components/Onboarding";
import { initNative } from "@/lib/native";
import { Splash } from "@/components/Splash";

function Shell({ children }: { children: React.ReactNode }) {
  const { loading, ctx } = useSession();
  const pathname = usePathname();
  useEffect(() => {
    initNative();
  }, []);

  if (loading) return <Splash label="Loading your workspace" />;
  if (!ctx) return <Splash label="Signing you in" />;
  if (!ctx.workspace) return <Splash label="Setting up your workspace" />;

  // Chat pages have their own bottom composer, so the mobile tab bar is hidden
  // there (a back button handles navigation). Match the singular chat routes
  // exactly — NOT the "/channels" list page.
  const hideNav = pathname === "/thread" || pathname === "/channel";

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl bg-[var(--bg)]">
      <Sidebar className="sticky top-0 hidden h-dvh md:flex" />
      <div className="flex min-h-dvh w-full flex-1 flex-col md:border-r md:border-[var(--border)]">
        <main
          key={pathname}
          className={`page-enter flex flex-1 flex-col ${hideNav ? "" : "pb-[calc(4.25rem+env(safe-area-inset-bottom))] md:pb-0"}`}
        >
          {children}
        </main>
        {!hideNav && (
          <div className="md:hidden">
            <BottomNav />
          </div>
        )}
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
