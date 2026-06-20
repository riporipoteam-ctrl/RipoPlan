/**
 * Standalone background worker for self-hosting (alternative to Vercel Cron).
 * Polls every minute and runs due jobs. Run with: `npm run worker`.
 * Requires SUPABASE_SERVICE_ROLE_KEY + GROQ_API_KEY in the environment.
 */
import { createClient } from "@supabase/supabase-js";
import { dispatch } from "../src/lib/orchestrator";
import { cronMatches } from "../src/lib/cron";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function tick() {
  const now = new Date();
  const { data: jobs } = await supabase.from("jobs").select("*").eq("enabled", true);
  const due = (jobs || []).filter((j: any) => j.schedule && cronMatches(j.schedule, now));
  for (const job of due) {
    try {
      const { data: agents } = await supabase
        .from("agents")
        .select("*")
        .eq("workspace_id", job.workspace_id)
        .neq("status", "archived");
      const { data: thread } = await supabase
        .from("threads")
        .insert({
          workspace_id: job.workspace_id,
          primary_agent_id: job.agent_id,
          title: job.name,
          summary: "Scheduled run",
          last_activity_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      await dispatch({
        supabase: supabase as any,
        workspaceId: job.workspace_id,
        threadId: job.channel_id ? null : thread?.id ?? null,
        channelId: job.channel_id,
        userContent: job.prompt || `Run scheduled job: ${job.name}`,
        agents: (agents as any) || [],
        primaryAgentId: job.agent_id,
      });
      await supabase.from("jobs").update({ last_run_at: now.toISOString() }).eq("id", job.id);
      console.log(`[worker] ran job ${job.name}`);
    } catch (e: any) {
      console.error(`[worker] job ${job.id} failed:`, e.message);
    }
  }
}

console.log("[worker] started, polling every 60s");
tick();
setInterval(tick, 60_000);
