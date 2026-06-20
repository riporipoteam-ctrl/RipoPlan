import type { SupabaseClient } from "@supabase/supabase-js";
import { dispatch, selectAgents } from "./orchestrator";
import { summarizeThread } from "./summarize";
import { groq, GROQ_MODEL } from "./groq";
import { AGENT_COLORS } from "./emoji";
import type { Agent } from "./types";
import type { SessionCtx } from "./session";

type SB = SupabaseClient;

async function getAgents(supabase: SB, workspaceId: string): Promise<Agent[]> {
  const { data } = await supabase
    .from("agents")
    .select("*")
    .eq("workspace_id", workspaceId)
    .neq("status", "archived")
    .order("created_at", { ascending: true });
  return (data as Agent[]) || [];
}

export async function startThread(supabase: SB, ctx: SessionCtx, content: string): Promise<string | null> {
  const agents = await getAgents(supabase, ctx.workspace.id);
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
  if (!thread) return null;

  await supabase.from("messages").insert({
    workspace_id: ctx.workspace.id,
    thread_id: thread.id,
    sender_type: "user",
    user_id: ctx.userId,
    content,
    status: "complete",
  });
  return thread.id as string;
}

/** Run agents for a thread after the user message exists. Updates title/summary. */
export async function runThread(supabase: SB, ctx: SessionCtx, threadId: string, content: string) {
  const agents = await getAgents(supabase, ctx.workspace.id);
  const { data: thread } = await supabase
    .from("threads")
    .select("primary_agent_id")
    .eq("id", threadId)
    .maybeSingle();

  await dispatch({
    supabase,
    workspaceId: ctx.workspace.id,
    workspaceName: ctx.workspace.name,
    threadId,
    userContent: content,
    agents,
    primaryAgentId: thread?.primary_agent_id ?? null,
  });

  const { data: reply } = await supabase
    .from("messages")
    .select("content")
    .eq("thread_id", threadId)
    .eq("sender_type", "agent")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const meta = await summarizeThread(content, reply?.content || "");
  await supabase
    .from("threads")
    .update({ title: meta.title, summary: meta.summary, last_activity_at: new Date().toISOString() })
    .eq("id", threadId);
}

export async function postMessage(
  supabase: SB,
  ctx: SessionCtx,
  opts: { content: string; threadId?: string; channelId?: string }
) {
  const agents = await getAgents(supabase, ctx.workspace.id);
  await supabase.from("messages").insert({
    workspace_id: ctx.workspace.id,
    thread_id: opts.threadId ?? null,
    channel_id: opts.channelId ?? null,
    sender_type: "user",
    user_id: ctx.userId,
    content: opts.content,
    status: "complete",
  });

  let primaryAgentId: string | null = null;
  if (opts.threadId) {
    await supabase.from("threads").update({ last_activity_at: new Date().toISOString() }).eq("id", opts.threadId);
    const { data: t } = await supabase.from("threads").select("primary_agent_id").eq("id", opts.threadId).maybeSingle();
    primaryAgentId = t?.primary_agent_id ?? null;
  }

  const hasMention = /@[\w-]+/.test(opts.content);
  if (opts.threadId || hasMention) {
    await dispatch({
      supabase,
      workspaceId: ctx.workspace.id,
      workspaceName: ctx.workspace.name,
      threadId: opts.threadId ?? null,
      channelId: opts.channelId ?? null,
      userContent: opts.content,
      agents,
      primaryAgentId,
    });
  }
}

const VALID_TOOLS = ["web_search", "browse", "code"];
const VALID_EMOJI = ["sparkles","pencil","magnifier","wrench","globe","robot","rocket","brain","chart","mail","code","camera","calendar","bell","bolt"];

export async function createAgent(supabase: SB, ctx: SessionCtx, description: string): Promise<string | null> {
  let spec: any = {};
  const completion = await groq().chat.completions.create({
    model: GROQ_MODEL,
    messages: [
      {
        role: "system",
        content: `You design AI agents. From the user's description output ONLY JSON:
{"name":"short name","handle":"kebab-handle","role":"short role","description":"one sentence","goals":"1-3 sentences","emoji":one of ${JSON.stringify(VALID_EMOJI)},"tools":subset of ${JSON.stringify(VALID_TOOLS)},"schedule":"cron string or null","system_prompt":"detailed system prompt"}`,
      },
      { role: "user", content: description },
    ],
    temperature: 0.5,
    max_completion_tokens: 1000,
    reasoning_format: "hidden",
    response_format: { type: "json_object" },
  } as any);
  spec = JSON.parse(completion.choices[0].message.content || "{}");

  const tools = Array.isArray(spec.tools) ? spec.tools.filter((t: string) => VALID_TOOLS.includes(t)) : ["web_search"];
  const emoji = VALID_EMOJI.includes(spec.emoji) ? spec.emoji : "robot";
  const color = AGENT_COLORS[Math.floor(Math.random() * AGENT_COLORS.length)];

  const { data: agent, error } = await supabase
    .from("agents")
    .insert({
      workspace_id: ctx.workspace.id,
      name: spec.name || "New Agent",
      handle: (spec.handle || spec.name || "agent").toLowerCase().replace(/[^a-z0-9-]/g, "-"),
      role: spec.role || "AI Agent",
      description: spec.description || description.slice(0, 140),
      goals: spec.goals || null,
      emoji,
      avatar_color: color,
      tools,
      schedule: spec.schedule || null,
      system_prompt: spec.system_prompt || null,
      created_by: ctx.userId,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  if (spec.schedule) {
    await supabase.from("jobs").insert({
      workspace_id: ctx.workspace.id,
      agent_id: agent.id,
      name: `${agent.name} scheduled run`,
      schedule: spec.schedule,
      prompt: spec.goals || description,
      enabled: true,
    });
  }
  return agent.id as string;
}

export async function updateAgent(supabase: SB, ctx: SessionCtx, id: string, patch: Record<string, any>) {
  await supabase.from("agents").update(patch).eq("id", id).eq("workspace_id", ctx.workspace.id);
}

export async function archiveAgent(supabase: SB, ctx: SessionCtx, id: string) {
  await supabase.from("agents").update({ status: "archived" }).eq("id", id).eq("workspace_id", ctx.workspace.id);
}

export async function openAgentDM(supabase: SB, ctx: SessionCtx, agentId: string): Promise<string | null> {
  const { data: agent } = await supabase.from("agents").select("*").eq("id", agentId).maybeSingle();
  if (!agent) return null;
  const { data: existing } = await supabase
    .from("threads")
    .select("id")
    .eq("workspace_id", ctx.workspace.id)
    .eq("primary_agent_id", agentId)
    .eq("created_by", ctx.userId)
    .is("channel_id", null)
    .ilike("title", "Chat with %")
    .limit(1)
    .maybeSingle();
  if (existing?.id) return existing.id as string;

  const { data: thread } = await supabase
    .from("threads")
    .insert({
      workspace_id: ctx.workspace.id,
      primary_agent_id: agentId,
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
    agent_id: agentId,
    content: `Hi! I'm **${agent.name}**, ${agent.role}. ${agent.description || ""} How can I help?`,
    status: "complete",
  });
  return thread!.id as string;
}

export async function toggleJob(supabase: SB, ctx: SessionCtx, id: string, enabled: boolean) {
  await supabase.from("jobs").update({ enabled }).eq("id", id).eq("workspace_id", ctx.workspace.id);
}

export async function runJob(supabase: SB, ctx: SessionCtx, id: string): Promise<string | null> {
  const { data: job } = await supabase.from("jobs").select("*").eq("id", id).maybeSingle();
  if (!job) return null;
  const agents = await getAgents(supabase, ctx.workspace.id);

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
    supabase,
    workspaceId: ctx.workspace.id,
    workspaceName: ctx.workspace.name,
    threadId,
    channelId: job.channel_id,
    userContent: job.prompt || `Run scheduled job: ${job.name}`,
    agents,
    primaryAgentId: job.agent_id,
  });
  await supabase.from("jobs").update({ last_run_at: new Date().toISOString() }).eq("id", id);
  return threadId;
}

export async function toggleIntegration(supabase: SB, ctx: SessionCtx, provider: string, connect: boolean) {
  const { data: existing } = await supabase
    .from("integrations")
    .select("id")
    .eq("workspace_id", ctx.workspace.id)
    .eq("provider", provider)
    .maybeSingle();
  if (existing) {
    await supabase
      .from("integrations")
      .update({ status: connect ? "connected" : "available", account_label: connect ? ctx.profile.email : null })
      .eq("id", existing.id);
  } else if (connect) {
    await supabase.from("integrations").insert({
      workspace_id: ctx.workspace.id,
      provider,
      status: "connected",
      account_label: ctx.profile.email,
      connected_by: ctx.userId,
    });
  }
}

export async function addKnowledge(supabase: SB, ctx: SessionCtx, title: string, content: string) {
  const { data } = await supabase
    .from("knowledge")
    .insert({ workspace_id: ctx.workspace.id, title: title.slice(0, 200), content: content || null, created_by: ctx.userId })
    .select("*")
    .single();
  return data;
}

export async function deleteKnowledge(supabase: SB, ctx: SessionCtx, id: string) {
  await supabase.from("knowledge").delete().eq("id", id).eq("workspace_id", ctx.workspace.id);
}
