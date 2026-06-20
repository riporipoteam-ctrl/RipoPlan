import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAgents, getSessionContext } from "@/lib/data";
import { dispatch } from "@/lib/orchestrator";

export const maxDuration = 60;

// PATCH: enable/disable a job
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getSessionContext();
  if (!ctx?.workspace) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { enabled } = await req.json();
  const supabase = await createClient();
  await supabase.from("jobs").update({ enabled }).eq("id", id).eq("workspace_id", ctx.workspace.id);
  return NextResponse.json({ ok: true });
}

// POST: run the job now
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getSessionContext();
  if (!ctx?.workspace) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = await createClient();
  const { data: job } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", id)
    .eq("workspace_id", ctx.workspace.id)
    .maybeSingle();
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });

  const agents = await getAgents(ctx.workspace.id);

  // Run into the job's channel if set, otherwise create a thread
  let threadId: string | null = null;
  if (!job.channel_id) {
    const { data: thread } = await supabase
      .from("threads")
      .insert({
        workspace_id: ctx.workspace.id,
        primary_agent_id: job.agent_id,
        title: job.name,
        summary: "Scheduled run",
        created_by: ctx.userId,
        last_activity_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    threadId = thread!.id;
  }

  await dispatch({
    supabase: supabase as any,
    workspaceId: ctx.workspace.id,
    workspaceName: ctx.workspace.name,
    threadId,
    channelId: job.channel_id,
    userContent: job.prompt || `Run scheduled job: ${job.name}`,
    agents,
    primaryAgentId: job.agent_id,
  });

  await supabase.from("jobs").update({ last_run_at: new Date().toISOString() }).eq("id", id);
  return NextResponse.json({ ok: true, threadId });
}
