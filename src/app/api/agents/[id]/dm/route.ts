import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/data";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getSessionContext();
  if (!ctx?.workspace) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = await createClient();
  const { data: agent } = await supabase
    .from("agents")
    .select("*")
    .eq("id", id)
    .eq("workspace_id", ctx.workspace.id)
    .maybeSingle();
  if (!agent) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Get-or-create a DM thread for this user + agent
  const { data: existing } = await supabase
    .from("threads")
    .select("id")
    .eq("workspace_id", ctx.workspace.id)
    .eq("primary_agent_id", id)
    .eq("created_by", ctx.userId)
    .is("channel_id", null)
    .ilike("title", "Chat with %")
    .limit(1)
    .maybeSingle();

  if (existing?.id) return NextResponse.json({ threadId: existing.id });

  const { data: thread } = await supabase
    .from("threads")
    .insert({
      workspace_id: ctx.workspace.id,
      primary_agent_id: id,
      title: `Chat with ${agent.name}`,
      summary: agent.description,
      created_by: ctx.userId,
      last_activity_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  await supabase.from("messages").insert({
    workspace_id: ctx.workspace.id,
    thread_id: thread!.id,
    sender_type: "agent",
    agent_id: id,
    content: `Hi! I'm **${agent.name}**, ${agent.role}. ${agent.description || ""} How can I help?`,
    status: "complete",
  });

  return NextResponse.json({ threadId: thread!.id });
}
