"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Wrench, Clock, Brain, Activity, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/lib/session";
import { TopBar } from "@/components/TopBar";
import { AgentAvatar } from "@/components/Avatar";
import { AgentActions } from "@/components/AgentActions";
import { AgentEditor } from "@/components/AgentEditor";
import { relativeTime } from "@/lib/format";
import type { Agent } from "@/lib/types";

const TOOL_LABELS: Record<string, string> = {
  web_search: "Web Search",
  browse: "Browse Pages",
  code: "Code Execution",
};

function AgentView() {
  const supabase = createClient();
  const { ctx } = useSession();
  const id = useSearchParams().get("id") || "";
  const [agent, setAgent] = useState<Agent | null>(null);
  const [runs, setRuns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ctx || !id) return;
    let active = true;
    (async () => {
      const [{ data: a }, { data: r }] = await Promise.all([
        supabase.from("agents").select("*").eq("id", id).maybeSingle(),
        supabase.from("agent_runs").select("*").eq("agent_id", id).order("started_at", { ascending: false }).limit(8),
      ]);
      if (!active) return;
      setAgent(a as Agent);
      setRuns((r as any[]) || []);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx?.workspace.id, id]);

  if (loading || !agent) {
    return <div className="flex flex-1 items-center justify-center text-[var(--muted)]"><Loader2 className="animate-spin" /></div>;
  }

  return (
    <>
      <TopBar title={agent.name} subtitle={agent.role || undefined} back="/agents" />
      <div className="flex-1 space-y-4 px-4 py-4">
        <div className="flex items-center gap-3">
          <AgentAvatar emoji={agent.emoji} color={agent.avatar_color} imageUrl={agent.avatar_url} size={56} withDot={agent.status === "active"} />
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold">{agent.name}</h2>
            <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
              <span>{agent.role}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${agent.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                {agent.status}
              </span>
            </div>
          </div>
        </div>

        <AgentActions agent={agent} />
        <AgentEditor agent={agent} onChange={setAgent} />

        {agent.description && (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
            <p className="text-sm">{agent.description}</p>
            {agent.goals && <p className="mt-2 text-sm text-[var(--muted)]">{agent.goals}</p>}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-[var(--muted)]"><Wrench size={14} /> TOOLS</div>
            <div className="flex flex-wrap gap-1.5">
              {(agent.tools || []).length === 0 && <span className="text-sm text-[var(--muted)]">None</span>}
              {(agent.tools || []).map((t) => (
                <span key={t} className="rounded-lg bg-nebula-100 px-2 py-1 text-xs font-medium text-nebula-700">{TOOL_LABELS[t] || t}</span>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-[var(--muted)]"><Clock size={14} /> SCHEDULE</div>
            <p className="text-sm">{agent.schedule ? <code>{agent.schedule}</code> : "On demand"}</p>
            <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-[var(--muted)]"><Brain size={14} /> MEMORY</div>
            <p className="text-sm">{agent.memory_enabled ? "Enabled" : "Off"}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-[var(--muted)]"><Activity size={14} /> RECENT RUNS</div>
          {runs.length === 0 && <p className="text-sm text-[var(--muted)]">No runs yet. Message this agent to get started.</p>}
          <div className="space-y-2">
            {runs.map((r) => (
              <div key={r.id} className="flex items-center justify-between border-b border-[var(--border)] pb-2 text-sm last:border-0">
                <div className="min-w-0">
                  <div className="truncate">{r.input || r.trigger}</div>
                  <div className="text-xs text-[var(--muted)]">{(r.tokens_in || 0) + (r.tokens_out || 0)} tokens · {r.steps?.length || 0} tool calls</div>
                </div>
                <div className="ml-2 flex shrink-0 items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${r.status === "done" ? "bg-emerald-500" : r.status === "error" ? "bg-red-500" : "bg-amber-500"}`} />
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

export default function AgentPage() {
  return (
    <Suspense fallback={<div className="flex flex-1 items-center justify-center text-[var(--muted)]"><Loader2 className="animate-spin" /></div>}>
      <AgentView />
    </Suspense>
  );
}
