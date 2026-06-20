import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAgents, getSessionContext } from "@/lib/data";
import { dispatch, selectAgents } from "@/lib/orchestrator";
import { summarizeThread } from "@/lib/summarize";

export const maxDuration = 60;

export async function POST(req: Request) {
  const ctx = await getSessionContext();
  if (!ctx?.workspace) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { content } = await req.json();
  if (!content?.trim()) return NextResponse.json({ error: "empty" }, { status: 400 });

  const supabase = await createClient();
  const agents = await getAgents(ctx.workspace.id);
  const primary = selectAgents(content, agents, null)[0];

  const { data: thread } = await supabase
    .from("threads")
    .insert({
      workspace_id: ctx.workspace.id,
      primary_agent_id: primary?.id ?? null,
      title: content.split(/\s+/).slice(0, 6).join(" ").slice(0, 80),
      summary: "Working on it…",
      created_by: ctx.userId,
      last_activity_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (!thread) return NextResponse.json({ error: "failed" }, { status: 500 });

  await supabase.from("messages").insert({
    workspace_id: ctx.workspace.id,
    thread_id: thread.id,
    sender_type: "user",
    user_id: ctx.userId,
    content,
    status: "complete",
  });

  await dispatch({
    supabase: supabase as any,
    workspaceId: ctx.workspace.id,
    workspaceName: ctx.workspace.name,
    threadId: thread.id,
    userContent: content,
    agents,
    primaryAgentId: primary?.id ?? null,
  });

  // Generate nice title/summary from the first exchange
  const { data: reply } = await supabase
    .from("messages")
    .select("content")
    .eq("thread_id", thread.id)
    .eq("sender_type", "agent")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const meta = await summarizeThread(content, reply?.content || "");
  await supabase
    .from("threads")
    .update({ title: meta.title, summary: meta.summary, last_activity_at: new Date().toISOString() })
    .eq("id", thread.id);

  return NextResponse.json({ threadId: thread.id });
}
