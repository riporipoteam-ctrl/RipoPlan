import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { dispatch } from "@/lib/orchestrator";
import { cronMatches } from "@/lib/cron";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Runs due scheduled jobs. Trigger via Vercel Cron (see vercel.json) or any
 * scheduler hitting /api/cron with header `Authorization: Bearer $CRON_SECRET`.
 * Requires SUPABASE_SERVICE_ROLE_KEY (no user session in cron context).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not set" }, { status: 500 });
  }

  const supabase = createServiceClient();
  const now = new Date();
  const { data: jobs } = await supabase.from("jobs").select("*").eq("enabled", true);

  const due = (jobs || []).filter((j: any) => j.schedule && cronMatches(j.schedule, now));
  let ran = 0;

  for (const job of due) {
    const { data: agents } = await supabase
      .from("agents")
      .select("*")
      .eq("workspace_id", job.workspace_id)
      .neq("status", "archived");
    const { data: ws } = await supabase
      .from("workspaces")
      .select("name")
      .eq("id", job.workspace_id)
      .maybeSingle();

    let threadId: string | null = null;
    if (!job.channel_id) {
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
      threadId = thread?.id ?? null;
    }

    await dispatch({
      supabase,
      workspaceId: job.workspace_id,
      workspaceName: ws?.name,
      threadId,
      channelId: job.channel_id,
      userContent: job.prompt || `Run scheduled job: ${job.name}`,
      agents: (agents as any) || [],
      primaryAgentId: job.agent_id,
    });

    await supabase.from("jobs").update({ last_run_at: now.toISOString() }).eq("id", job.id);
    ran++;
  }

  return NextResponse.json({ ok: true, checked: jobs?.length || 0, ran });
}
