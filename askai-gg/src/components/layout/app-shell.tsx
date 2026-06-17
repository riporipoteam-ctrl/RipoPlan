"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Bot,
  Boxes,
  Hash,
  Home,
  Plus,
  Search,
  Settings,
  Sparkles,
} from "lucide-react";
import type { ReactNode } from "react";

import { StatusBadge } from "@/components/shared/status-badge";
import type { Agent, Channel, User, Workspace } from "@/lib/types";
import { cn } from "@/lib/utils";

type AppShellProps = {
  workspace: Workspace;
  currentUser: User;
  channels: Channel[];
  agents: Agent[];
  notificationsCount: number;
  title: string;
  subtitle: string;
  actions?: ReactNode;
  children: ReactNode;
  aside?: ReactNode;
};

const navItems = [
  { href: "/", label: "Home", icon: Home },
  { href: "/channels/channel-general", label: "Channels", icon: Hash },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/integrations", label: "Integrations", icon: Sparkles },
  { href: "/inbox", label: "Inbox", icon: Bell },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({
  workspace,
  currentUser,
  channels,
  agents,
  notificationsCount,
  title,
  subtitle,
  actions,
  children,
  aside,
}: AppShellProps) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.12),_transparent_25%),radial-gradient(circle_at_20%_20%,_rgba(217,70,239,0.15),_transparent_22%),linear-gradient(180deg,_#08111f,_#04070f_58%,_#02040a)] text-slate-100">
      <div className="mx-auto grid min-h-screen max-w-[1600px] grid-cols-1 gap-6 px-4 py-4 lg:grid-cols-[280px_minmax(0,1fr)_320px]">
        <aside className="hidden rounded-[32px] border border-white/10 bg-[#09111f]/90 p-5 shadow-2xl lg:flex lg:flex-col">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-fuchsia-500 to-violet-500 text-lg font-black text-white shadow-lg shadow-fuchsia-500/30">
                ai
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Workspace</p>
                <h1 className="text-xl font-semibold text-white">{workspace.name}</h1>
              </div>
            </div>
            <StatusBadge label={workspace.plan} tone="fuchsia" />
          </div>

          <nav className="mt-8 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active =
                item.href === "/"
                  ? pathname === item.href
                  : pathname === item.href || pathname.startsWith(`${item.href}/`);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition hover:bg-white/8",
                    active
                      ? "bg-white/10 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]"
                      : "text-slate-300",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                  {item.href === "/inbox" && notificationsCount > 0 ? (
                    <span className="ml-auto rounded-full bg-fuchsia-500 px-2 py-0.5 text-[11px] font-semibold text-white">
                      {notificationsCount}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>

          <div className="mt-8 rounded-[28px] border border-cyan-300/10 bg-cyan-400/6 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.24em] text-cyan-200/75">Channels</p>
              <button className="rounded-full border border-white/10 p-2 text-slate-300 transition hover:bg-white/8">
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 space-y-2">
              {channels.map((channel) => (
                <Link
                  key={channel.id}
                  href={`/channels/${channel.id}`}
                  className="flex items-center justify-between rounded-2xl px-3 py-2 text-sm text-slate-200 transition hover:bg-white/8"
                >
                  <div className="flex items-center gap-2">
                    <Hash className="h-4 w-4 text-slate-400" />
                    <span>{channel.name}</span>
                  </div>
                  {channel.unreadCount > 0 ? (
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-slate-200">
                      {channel.unreadCount}
                    </span>
                  ) : null}
                </Link>
              ))}
            </div>
          </div>

          <div className="mt-6 flex-1 rounded-[28px] border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Agents online</p>
              <Boxes className="h-4 w-4 text-slate-400" />
            </div>
            <div className="mt-4 space-y-3">
              {agents.slice(0, 4).map((agent) => (
                <Link
                  key={agent.id}
                  href={`/agents/${agent.id}`}
                  className="flex items-center gap-3 rounded-2xl px-2 py-2 transition hover:bg-white/8"
                >
                  <div
                    className={cn(
                      "grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br text-sm font-bold text-white",
                      agent.color,
                    )}
                  >
                    {agent.name[0]}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white">{agent.name}</p>
                    <p className="truncate text-xs text-slate-400">{agent.summary}</p>
                  </div>
                  <span className="h-3 w-3 rounded-full bg-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.7)]" />
                </Link>
              ))}
            </div>
          </div>

          <div className="mt-5 flex items-center gap-3 rounded-[24px] border border-white/10 bg-white/6 p-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-rose-500 text-sm font-black text-white">
              {currentUser.avatar}
            </div>
            <div>
              <p className="text-sm font-semibold text-white">{currentUser.name}</p>
              <p className="text-xs text-slate-400">{currentUser.email}</p>
            </div>
          </div>
        </aside>

        <main className="flex min-h-[80vh] flex-col rounded-[32px] border border-white/10 bg-white/6 p-4 shadow-2xl backdrop-blur-xl">
          <header className="flex flex-col gap-4 border-b border-white/10 pb-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-cyan-200/70">{workspace.slug}</p>
              <h2 className="mt-1 font-serif text-3xl font-semibold text-white">{title}</h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-300">{subtitle}</p>
            </div>
            <div className="flex items-center gap-3">
              <button className="grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-white/6 text-slate-200 transition hover:bg-white/10">
                <Search className="h-4 w-4" />
              </button>
              <button className="grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-white/6 text-slate-200 transition hover:bg-white/10">
                <Bell className="h-4 w-4" />
              </button>
              <div className="hidden md:block">{actions}</div>
            </div>
          </header>

          <div className="mt-6 flex-1">{children}</div>

          <nav className="mt-6 grid grid-cols-5 gap-2 rounded-[24px] border border-white/10 bg-[#07111d]/90 p-2 lg:hidden">
            {navItems.slice(0, 5).map((item) => {
              const Icon = item.icon;
              const active =
                item.href === "/"
                  ? pathname === item.href
                  : pathname === item.href || pathname.startsWith(`${item.href}/`);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-2xl px-2 py-3 text-[11px] font-medium transition",
                    active ? "bg-fuchsia-500 text-white" : "text-slate-300",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </main>

        <aside className="hidden rounded-[32px] border border-white/10 bg-white/5 p-4 shadow-2xl backdrop-blur-xl lg:block">
          {aside}
        </aside>
      </div>
    </div>
  );
}
