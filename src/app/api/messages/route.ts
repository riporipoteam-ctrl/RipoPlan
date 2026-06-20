import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAgents, getSessionContext } from "@/lib/data";
import { dispatch } from "@/lib/orchestrator";

export const maxDuration = 60;

export async function POST(req: Request) {
  const ctx = await getSessionContext();
  if (!ctx?.workspace) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { content, threadId, channelId } = await req.json();
  if (!content?.trim()) return NextResponse.json({ error: "empty" }, { status: 400 });
  if (!threadId && !channelId)
    return NextResponse.json({ error: "no target" }, { status: 400 });

  const supabase = await createClient();
  const agents = await getAgents(ctx.workspace.id);

  // Resolve thread primary agent if posting to a thread
  let primaryAgentId: string | null = null;
  if (threadId) {
    const { data: thread } = await supabase
      .from("threads")
      .select("primary_agent_id")
      .eq("id", threadId)
      .maybeSingle();
    primaryAgentId = thread?.primary_agent_id ?? null;
  }

  await supabase.from("messages").insert({
    workspace_id: ctx.workspace.id,
    thread_id: threadId ?? null,
    channel_id: channelId ?? null,
    sender_type: "user",
    user_id: ctx.userId,
    content,
    status: "complete",
  });

  if (threadId) {
    await supabase
      .from("threads")
      .update({ last_activity_at: new Date().toISOString() })
      .eq("id", threadId);
  }

  // In channels, only trigger agents when explicitly @mentioned.
  // In threads, always continue the conversation with the thread's agent.
  const hasMention = /@[\w-]+/.test(content);
  if (threadId || hasMention) {
    await dispatch({
      supabase: supabase as any,
      workspaceId: ctx.workspace.id,
      workspaceName: ctx.workspace.name,
      threadId: threadId ?? null,
      channelId: channelId ?? null,
      userContent: content,
      agents,
      primaryAgentId,
    });
  }

  return NextResponse.json({ ok: true });
}
