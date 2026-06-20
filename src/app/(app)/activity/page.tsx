import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAgents, getSessionContext } from "@/lib/data";
import { TopBar } from "@/components/TopBar";
import { AgentAvatar } from "@/components/Avatar";
import { relativeTime } from "@/lib/format";
import { Zap } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const ctx = await getSessionContext();
  if (!ctx?.workspace) redirect("/login");

  const supabase = await createClient();
  const [{ data: runs }, agents] = await Promise.all([
    supabase
      .from("agent_runs")
      .select("*")
      .eq("workspace_id", ctx.workspace.id)
      .order("started_at", { ascending: false })
      .limit(40),
    getAgents(ctx.workspace.id),
  ]);
  const agentMap = new Map(agents.map((a) => [a.id, a]));

  return (
    <>
      <TopBar
        title="Activity"
        profileName={ctx.profile.display_name}
        profileColor={ctx.profile.avatar_color}
      />
      <div className="flex-1 px-4 py-4">
        {(!runs || runs.length === 0) && (
          <div className="flex flex-col items-center gap-2 py-16 text-center text-sm text-[var(--muted)]">
            <Zap />
            Your agents&apos; activity will show up here.
          </div>
        )}
        <div className="space-y-3">
          {(runs || []).map((r: any) => {
            const agent = agentMap.get(r.agent_id);
            return (
              <div
                key={r.id}
                className="flex gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3"
              >
                <AgentAvatar emoji={agent?.emoji} color={agent?.avatar_color} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{agent?.name || "Agent"}</span>
                    <span className="text-xs text-[var(--muted)]">{relativeTime(r.started_at)}</span>
                  </div>
                  <p className="truncate text-sm text-[var(--muted)]">{r.input || r.trigger}</p>
                  <div className="mt-1 flex items-center gap-2 text-xs text-[var(--muted)]">
                    <span
                      className={`rounded-full px-2 py-0.5 ${
                        r.status === "done"
                          ? "bg-emerald-100 text-emerald-700"
                          : r.status === "error"
                          ? "bg-red-100 text-red-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {r.status}
                    </span>
                    <span>{(r.steps?.length || 0)} tool calls</span>
                    <span>· {r.tokens_in + r.tokens_out} tokens</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
