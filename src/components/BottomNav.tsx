"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Hash, Bot, Zap, LayoutGrid } from "lucide-react";
import clsx from "clsx";
import { haptic } from "@/lib/native";

const items = [
  { href: "/home", icon: Home, label: "Home" },
  { href: "/channels", icon: Hash, label: "Channels" },
  { href: "/agents", icon: Bot, label: "Agents" },
  { href: "/activity", icon: Zap, label: "Activity" },
  { href: "/apps", icon: LayoutGrid, label: "Apps" },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="glass fixed inset-x-0 bottom-0 z-30 border-x-0 border-b-0 pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-2xl items-center justify-around px-2 py-2.5">
        {items.map((it) => {
          const active = pathname === it.href || pathname.startsWith(it.href + "/");
          const Icon = it.icon;
          return (
            <Link
              key={it.href}
              href={it.href}
              aria-label={it.label}
              onClick={() => haptic("light")}
              className={clsx(
                "relative flex h-10 w-12 items-center justify-center rounded-xl transition-colors",
                active ? "text-nebula-600" : "text-[var(--muted)] hover:text-[var(--text)]"
              )}
            >
              <Icon size={24} strokeWidth={active ? 2.4 : 2} />
              {active && <span className="absolute -bottom-0.5 h-1 w-1 rounded-full bg-nebula-600 animate-pop-in" />}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
