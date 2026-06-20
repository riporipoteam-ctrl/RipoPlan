"use client";

import { useEffect, useState } from "react";
import { Clock, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/lib/session";
import { TopBar } from "@/components/TopBar";
import { JobRow } from "@/components/JobRow";
import type { Agent, Job } from "@/lib/types";

export default function JobsPage() {
  const supabase = createClient();
  const { ctx } = useSession();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ctx) return;
    let active = true;
    (async () => {
      const [{ data: j }, { data: a }] = await Promise.all([
        supabase.from("jobs").select("*").eq("workspace_id", ctx.workspace.id).order("created_at", { ascending: false }),
        supabase.from("agents").select("*").eq("workspace_id", ctx.workspace.id),
      ]);
      if (!active) return;
      setJobs((j as Job[]) || []);
      setAgents((a as Agent[]) || []);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx?.workspace.id]);

  const agentMap = new Map(agents.map((a) => [a.id, a]));

  return (
    <>
      <TopBar title="Jobs" subtitle="Scheduled recurring agent runs" back="/settings" />
      <div className="flex-1 space-y-3 px-4 py-4">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 text-xs text-[var(--muted)]">
          Tip: schedules run automatically while the app is open. For 24/7 background runs, point a scheduler (e.g. a Supabase cron/Edge Function) at your workspace.
        </div>
        {loading ? (
          <div className="flex justify-center py-10 text-[var(--muted)]"><Loader2 className="animate-spin" /></div>
        ) : jobs.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center text-sm text-[var(--muted)]">
            <Clock /> No jobs yet. Create an agent with a schedule (e.g. &quot;every morning…&quot;) and a job appears here.
          </div>
        ) : (
          jobs.map((j) => <JobRow key={j.id} job={j} agent={agentMap.get(j.agent_id)} />)
        )}
      </div>
    </>
  );
}
