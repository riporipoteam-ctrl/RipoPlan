import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAgents, getSessionContext } from "@/lib/data";
import { TopBar } from "@/components/TopBar";
import { JobRow } from "@/components/JobRow";
import type { Job } from "@/lib/types";
import { Clock } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function JobsPage() {
  const ctx = await getSessionContext();
  if (!ctx?.workspace) redirect("/login");

  const supabase = await createClient();
  const [{ data: jobs }, agents] = await Promise.all([
    supabase
      .from("jobs")
      .select("*")
      .eq("workspace_id", ctx.workspace.id)
      .order("created_at", { ascending: false }),
    getAgents(ctx.workspace.id),
  ]);
  const agentMap = new Map(agents.map((a) => [a.id, a]));

  return (
    <>
      <TopBar title="Jobs" subtitle="Scheduled recurring agent runs" back="/home" />
      <div className="flex-1 space-y-3 px-4 py-4">
        {(!jobs || jobs.length === 0) && (
          <div className="flex flex-col items-center gap-2 py-16 text-center text-sm text-[var(--muted)]">
            <Clock />
            No jobs yet. Create an agent with a schedule (e.g. &quot;every morning…&quot;) and a job
            appears here.
          </div>
        )}
        {(jobs as Job[] | null)?.map((j) => (
          <JobRow key={j.id} job={j} agent={agentMap.get(j.agent_id)} />
        ))}
      </div>
    </>
  );
}
