"use client";

import { useEffect, useState } from "react";
import { Zap, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/lib/session";
import { TopBar } from "@/components/TopBar";
import { AgentAvatar } from "@/components/Avatar";
import { relativeTime } from "@/lib/format";
import type { Agent } from "@/lib/types";

export default function ActivityPage() {
  const supabase = createClient();
  const { ctx } = useSession();
  const [runs, setRuns] = useState<any[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ctx) return;
    let active = true;
    async function load() {
      const [{ data: r }, { data: a }] = await Promise.all([
        supabase.from("agent_runs").select("*").eq("workspace_id", ctx!.workspace.id).order("started_at", { ascending: false }).limit(40),
        supabase.from("agents").select("*").eq("workspace_id", ctx!.workspace.id),
      ]);
      if (!active) return;
      setRuns((r as any[]) || []);
      setAgents((a as Agent[]) || []);
      setLoading(false);
    }
    load();
    const ch = supabase
      .channel(`activity-${ctx.workspace.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "agent_runs", filter: `workspace_id=eq.${ctx.workspace.id}` }, load)
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx?.workspace.id]);

  const agentMap = new Map(agents.map((a) => [a.id, a]));

  return (
    <>
      <TopBar title="Activity" profileName={ctx?.profile.display_name} profileColor={ctx?.profile.avatar_color} />
      <div className="flex-1 px-4 py-4">
        {loading ? (
          <div className="flex justify-center py-10 text-[var(--muted)]"><Loader2 className="animate-spin" /></div>
        ) : runs.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center text-sm text-[var(--muted)]">
            <Zap /> Your agents&apos; activity will show up here.
          </div>
        ) : (
          <div className="space-y-3">
            {runs.map((r) => {
              const agent = agentMap.get(r.agent_id);
              return (
                <div key={r.id} className="flex gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3">
                  <AgentAvatar emoji={agent?.emoji} color={agent?.avatar_color} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{agent?.name || "Agent"}</span>
                      <span className="text-xs text-[var(--muted)]">{relativeTime(r.started_at)}</span>
                    </div>
                    <p className="truncate text-sm text-[var(--muted)]">{r.input || r.trigger}</p>
                    <div className="mt-1 flex items-center gap-2 text-xs text-[var(--muted)]">
                      <span className={`rounded-full px-2 py-0.5 ${r.status === "done" ? "bg-emerald-100 text-emerald-700" : r.status === "error" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{r.status}</span>
                      <span>{r.steps?.length || 0} tool calls</span>
                      <span>· {(r.tokens_in || 0) + (r.tokens_out || 0)} tokens</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
