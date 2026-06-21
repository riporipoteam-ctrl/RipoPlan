"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Hash, Bot, Zap, LayoutGrid, Clock, Settings, Sparkles, BookOpen } from "lucide-react";
import clsx from "clsx";
import { useSession } from "@/lib/session";
import { UserAvatar } from "./Avatar";

const items = [
  { href: "/home", icon: Home, label: "Home" },
  { href: "/channels", icon: Hash, label: "Channels" },
  { href: "/agents", icon: Bot, label: "Agents" },
  { href: "/jobs", icon: Clock, label: "Jobs" },
  { href: "/knowledge", icon: BookOpen, label: "Knowledge" },
  { href: "/activity", icon: Zap, label: "Activity" },
  { href: "/apps", icon: LayoutGrid, label: "Apps" },
];

export function Sidebar({ className }: { className?: string }) {
  const pathname = usePathname();
  const { ctx } = useSession();

  return (
    <aside className={clsx("w-64 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--card)]/40 p-3", className)}>
      <Link href="/home" className="mb-4 flex items-center gap-2 px-2 py-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-nebula-500 to-nebula-pink shadow-md shadow-nebula-600/30">
          <Sparkles size={18} className="text-white" />
        </span>
        <span className="text-lg font-bold tracking-tight">AgentNexus</span>
      </Link>

      <nav className="flex flex-1 flex-col gap-1">
        {items.map((it) => {
          const active = pathname === it.href || pathname.startsWith(it.href + "/");
          const Icon = it.icon;
          return (
            <Link
              key={it.href}
              href={it.href}
              className={clsx(
                "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all",
                active
                  ? "bg-nebula-600/10 text-nebula-600"
                  : "text-[var(--muted)] hover:bg-black/5 hover:text-[var(--text)] dark:hover:bg-white/5"
              )}
            >
              <Icon size={18} strokeWidth={active ? 2.4 : 2} />
              {it.label}
            </Link>
          );
        })}
      </nav>

      <Link
        href="/settings"
        className="mt-2 flex items-center gap-3 rounded-xl border border-[var(--border)] px-3 py-2.5 transition-colors hover:bg-black/5 dark:hover:bg-white/5"
      >
        <UserAvatar name={ctx?.profile.display_name} color={ctx?.profile.avatar_color} size={32} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{ctx?.profile.display_name || "You"}</div>
          <div className="truncate text-xs text-[var(--muted)]">{ctx?.workspace.name}</div>
        </div>
        <Settings size={16} className="text-[var(--muted)]" />
      </Link>
    </aside>
  );
}
