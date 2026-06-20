import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/data";
import { TopBar } from "@/components/TopBar";
import { ProfileActions } from "@/components/ProfileActions";
import { BookOpen, Clock, LayoutGrid, Bot, Monitor, Boxes, ChevronRight } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const ctx = await getSessionContext();
  if (!ctx?.workspace) redirect("/login");

  const supabase = await createClient();
  const [{ count: agentCount }, { data: runs }] = await Promise.all([
    supabase.from("agents").select("id", { count: "exact", head: true }).eq("workspace_id", ctx.workspace.id).neq("status", "archived"),
    supabase.from("agent_runs").select("tokens_in,tokens_out").eq("workspace_id", ctx.workspace.id),
  ]);
  const totalRuns = runs?.length || 0;
  const totalTokens = (runs || []).reduce((s: number, r: any) => s + (r.tokens_in || 0) + (r.tokens_out || 0), 0);
  // Groq qwen pricing: ~$0.6/M in, $3/M out — rough blended estimate
  const estCost = ((totalTokens / 1_000_000) * 1.2).toFixed(4);

  const links = [
    { href: "/knowledge", icon: BookOpen, label: "Knowledge", sub: "Shared context for agents" },
    { href: "/jobs", icon: Clock, label: "Jobs", sub: "Scheduled agent runs" },
    { href: "/agents", icon: Bot, label: "Agents", sub: "Manage your team" },
    { href: "/apps", icon: LayoutGrid, label: "Integrations", sub: "Connect your tools" },
    { href: "/devices", icon: Monitor, label: "Devices", sub: "Virtual computers" },
    { href: "/mini-apps", icon: Boxes, label: "Mini Apps", sub: "Custom agent apps" },
  ];

  return (
    <>
      <TopBar title="Settings" subtitle={ctx.workspace.name} back="/home" />
      <div className="flex-1 space-y-4 px-4 py-4">
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Agents", value: agentCount ?? 0 },
            { label: "Runs", value: totalRuns },
            { label: "Tokens", value: totalTokens.toLocaleString() },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 text-center">
              <div className="text-lg font-bold">{s.value}</div>
              <div className="text-xs text-[var(--muted)]">{s.label}</div>
            </div>
          ))}
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-[var(--muted)]">Estimated AI spend</span>
            <span className="font-semibold">${estCost}</span>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
          {links.map((it) => (
            <Link key={it.href} href={it.href} className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3 last:border-0 hover:bg-black/5">
              <it.icon size={18} className="text-[var(--muted)]" />
              <div className="flex-1">
                <div className="text-sm font-medium">{it.label}</div>
                <div className="text-xs text-[var(--muted)]">{it.sub}</div>
              </div>
              <ChevronRight size={16} className="text-[var(--muted)]" />
            </Link>
          ))}
        </div>

        <ProfileActions />
      </div>
    </>
  );
}
