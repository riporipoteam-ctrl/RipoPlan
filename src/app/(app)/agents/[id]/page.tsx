import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/data";
import { TopBar } from "@/components/TopBar";
import { AgentAvatar } from "@/components/Avatar";
import { AgentActions } from "@/components/AgentActions";
import { relativeTime } from "@/lib/format";
import type { Agent } from "@/lib/types";
import { Wrench, Clock, Brain, Activity } from "lucide-react";

export const dynamic = "force-dynamic";

const TOOL_LABELS: Record<string, string> = {
  web_search: "Web Search",
  browse: "Browse Pages",
  code: "Code Execution",
};

export default async function AgentDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getSessionContext();
  if (!ctx?.workspace) redirect("/login");

  const supabase = await createClient();
  const { data: agent } = await supabase.from("agents").select("*").eq("id", id).maybeSingle();
  if (!agent) notFound();
  const a = agent as Agent;

  const { data: runs } = await supabase
    .from("agent_runs")
    .select("*")
    .eq("agent_id", id)
    .order("started_at", { ascending: false })
    .limit(8);

  return (
    <>
      <TopBar title={a.name} subtitle={a.role || undefined} back="/agents" />
      <div className="flex-1 space-y-4 px-4 py-4">
        <div className="flex items-center gap-3">
          <AgentAvatar emoji={a.emoji} color={a.avatar_color} size={56} withDot={a.status === "active"} />
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold">{a.name}</h2>
            <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
              <span>{a.role}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  a.status === "active"
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                {a.status}
              </span>
            </div>
          </div>
        </div>

        <AgentActions agent={a} />

        {a.description && (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
            <p className="text-sm">{a.description}</p>
            {a.goals && <p className="mt-2 text-sm text-[var(--muted)]">{a.goals}</p>}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-[var(--muted)]">
              <Wrench size={14} /> TOOLS
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(a.tools || []).length === 0 && <span className="text-sm text-[var(--muted)]">None</span>}
              {(a.tools || []).map((t) => (
                <span key={t} className="rounded-lg bg-nebula-100 px-2 py-1 text-xs font-medium text-nebula-700">
                  {TOOL_LABELS[t] || t}
                </span>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-[var(--muted)]">
              <Clock size={14} /> SCHEDULE
            </div>
            <p className="text-sm">{a.schedule ? <code>{a.schedule}</code> : "On demand"}</p>
            <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-[var(--muted)]">
              <Brain size={14} /> MEMORY
            </div>
            <p className="text-sm">{a.memory_enabled ? "Enabled" : "Off"}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-[var(--muted)]">
            <Activity size={14} /> RECENT RUNS
          </div>
          {(!runs || runs.length === 0) && (
            <p className="text-sm text-[var(--muted)]">No runs yet. Message this agent to get started.</p>
          )}
          <div className="space-y-2">
            {(runs || []).map((r: any) => (
              <div key={r.id} className="flex items-center justify-between border-b border-[var(--border)] pb-2 text-sm last:border-0">
                <div className="min-w-0">
                  <div className="truncate">{r.input || r.trigger}</div>
                  <div className="text-xs text-[var(--muted)]">
                    {r.tokens_in + r.tokens_out} tokens · {(r.steps?.length || 0)} tool calls
                  </div>
                </div>
                <div className="ml-2 flex shrink-0 items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      r.status === "done"
                        ? "bg-emerald-500"
                        : r.status === "error"
                        ? "bg-red-500"
                        : "bg-amber-500"
                    }`}
                  />
                  <span className="text-xs text-[var(--muted)]">{relativeTime(r.started_at)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
