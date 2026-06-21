import type { SupabaseClient } from "@supabase/supabase-js";
import { runAgent } from "./agent-runner";
import type { Agent, Message } from "./types";
import { hasGroqKey, type ChatMessage } from "./groq";
import { AGENT_COLORS } from "./emoji";

/** Find agents explicitly @mentioned in the text. */
function parseMentions(content: string, agents: Agent[]): Agent[] {
  const handles = [...content.matchAll(/@([\w-]+)/g)].map((m) => m[1].toLowerCase());
  if (handles.length === 0) return [];
  return agents.filter((a) =>
    handles.includes((a.handle || "").toLowerCase()) ||
    handles.includes(a.name.toLowerCase().replace(/\s+/g, "-"))
  );
}

export function selectAgents(content: string, agents: Agent[], primaryAgentId?: string | null): Agent[] {
  const mentioned = parseMentions(content, agents);
  if (mentioned.length) return mentioned;
  if (primaryAgentId) {
    const a = agents.find((x) => x.id === primaryAgentId);
    if (a) return [a];
  }
  const supervisor = agents.find((a) => a.is_supervisor) || agents[0];
  return supervisor ? [supervisor] : [];
}

async function buildHistory(
  supabase: SupabaseClient,
  opts: { threadId?: string | null; channelId?: string | null },
  selfAgentId: string
): Promise<ChatMessage[]> {
  let q = supabase.from("messages").select("*").order("created_at", { ascending: true }).limit(30);
  if (opts.threadId) q = q.eq("thread_id", opts.threadId);
  else if (opts.channelId) q = q.eq("channel_id", opts.channelId).is("thread_id", null);
  const { data } = await q;
  const rows = (data as Message[]) || [];
  return rows
    .filter((m) => m.status !== "thinking" && (m.content || (m.attachments && m.attachments.length)))
    .map<ChatMessage>((m) => {
      const role = m.sender_type === "user" ? "user" : "assistant";
      const text =
        m.sender_type === "agent" && m.agent_id !== selfAgentId
          ? `[from another agent] ${m.content || ""}`
          : (m.content as string) || "";
      // Multimodal: include image attachments so vision-capable models can see them.
      const images = (m.attachments || []).filter((a: any) => a?.type === "image" && a.url);
      if (role === "user" && images.length) {
        return {
          role,
          content: [
            { type: "text", text: text || "(see attached image)" },
            ...images.map((img: any) => ({ type: "image_url", image_url: { url: img.url } })),
          ],
        } as any;
      }
      return { role, content: text };
    });
}

async function getMemories(
  supabase: SupabaseClient,
  agent: Agent,
  workspaceId: string
): Promise<string[]> {
  const out: string[] = [];

  // Workspace knowledge base — shared context for every agent
  const { data: kb } = await supabase
    .from("knowledge")
    .select("title,content")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(10);
  for (const k of (kb as { title: string; content: string }[]) || []) {
    out.push(`${k.title}: ${k.content || ""}`.trim());
  }

  // Agent's own long-term memory
  if (agent.memory_enabled) {
    const { data } = await supabase
      .from("agent_memories")
      .select("content")
      .eq("agent_id", agent.id)
      .order("created_at", { ascending: false })
      .limit(5);
    for (const m of (data as { content: string }[]) || []) out.push(m.content);
  }
  return out;
}

export interface DispatchOpts {
  supabase: SupabaseClient;
  workspaceId: string;
  workspaceName?: string;
  threadId?: string | null;
  channelId?: string | null;
  userContent: string;
  agents: Agent[];
  primaryAgentId?: string | null;
  createdBy?: string | null;
}

const SPEC_TOOLS = ["web_search", "browse", "code"];
const SPEC_EMOJI = ["robot", "rocket", "brain", "chart", "code", "wrench", "bolt", "magnifier", "pencil", "globe"];

/** Create a new agent from a create_agent tool call. */
async function createAgentFromSpec(
  supabase: SupabaseClient,
  workspaceId: string,
  createdBy: string | null,
  spec: any
) {
  const tools = Array.isArray(spec.tools) ? spec.tools.filter((t: string) => SPEC_TOOLS.includes(t)) : ["web_search", "browse", "code"];
  const emoji = SPEC_EMOJI[Math.floor(Math.random() * SPEC_EMOJI.length)];
  const color = AGENT_COLORS[Math.floor(Math.random() * AGENT_COLORS.length)];
  const handle = String(spec.name || "agent").toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40) || "agent";
  const { data, error } = await supabase
    .from("agents")
    .insert({
      workspace_id: workspaceId,
      name: spec.name || "New Agent",
      handle,
      role: spec.role || "AI Agent",
      description: spec.description || `${spec.role || "Helps with tasks"}.`,
      emoji,
      avatar_color: color,
      tools: tools.length ? tools : ["web_search", "browse", "code"],
      system_prompt: `You are ${spec.name || "an agent"}, ${spec.role || "an AI agent"}. ${spec.description || ""} Use your tools to do real work and answer clearly in markdown.`,
      created_by: createdBy,
    })
    .select("id,name,emoji,avatar_color,role")
    .single();
  if (error || !data) return null;
  return { id: data.id, name: data.name, emoji: data.emoji, color: data.avatar_color, role: data.role };
}

/** Delegate a task to an existing agent: it replies in the same thread/channel. */
async function delegateToAgent(
  supabase: SupabaseClient,
  o: {
    workspaceId: string;
    workspaceName?: string;
    threadId: string | null;
    channelId: string | null;
    agents: Agent[];
    connectors: Record<string, string>;
    handle: string;
    task: string;
  }
): Promise<string> {
  const target = o.agents.find(
    (a) => (a.handle || "").toLowerCase() === o.handle.toLowerCase() || a.name.toLowerCase() === o.handle.toLowerCase()
  );
  if (!target) return "";
  const { data: ph } = await supabase
    .from("messages")
    .insert({
      workspace_id: o.workspaceId,
      thread_id: o.threadId,
      channel_id: o.channelId,
      sender_type: "agent",
      agent_id: target.id,
      content: "",
      status: "thinking",
      activities: [],
    })
    .select("id")
    .single();
  const mid = ph?.id as string;
  try {
    const res = await runAgent({
      agent: target,
      history: [{ role: "user", content: o.task }],
      workspaceName: o.workspaceName,
      connectors: o.connectors,
      onActivity: async (activities) => {
        if (mid) await supabase.from("messages").update({ activities }).eq("id", mid);
      },
    });
    if (mid) await supabase.from("messages").update({ content: res.content, activities: res.activities, status: "complete" }).eq("id", mid);
    return res.content;
  } catch (e: any) {
    if (mid) await supabase.from("messages").update({ content: `⚠️ ${e.message}`, status: "error" }).eq("id", mid);
    return "";
  }
}

async function getConnectors(supabase: SupabaseClient, workspaceId: string): Promise<Record<string, string>> {
  const { data } = await supabase
    .from("integrations")
    .select("provider,secret")
    .eq("workspace_id", workspaceId)
    .eq("status", "connected");
  const out: Record<string, string> = {};
  for (const i of (data as { provider: string; secret: string | null }[]) || []) {
    if (i.secret) out[i.provider] = i.secret;
  }
  return out;
}

/** Run the selected agent(s) for a freshly-posted user message. Awaits completion. */
export async function dispatch(opts: DispatchOpts): Promise<void> {
  const { supabase, workspaceId } = opts;
  const selected = selectAgents(opts.userContent, opts.agents, opts.primaryAgentId);
  const connectors = await getConnectors(supabase, workspaceId);

  for (const agent of selected) {
    // No API key yet → post a friendly nudge instead of a raw 401.
    if (!hasGroqKey()) {
      await supabase.from("messages").insert({
        workspace_id: workspaceId,
        thread_id: opts.threadId ?? null,
        channel_id: opts.channelId ?? null,
        sender_type: "agent",
        agent_id: agent.id,
        content:
          "I'd love to help! I just need a **Groq API key** to think. Add one in **Settings → Groq API key** — it's free at console.groq.com/keys and stays on your device.",
        status: "complete",
      });
      continue;
    }

    // 1. Insert placeholder "thinking" message (realtime shows the typing bubble)
    const { data: placeholder } = await supabase
      .from("messages")
      .insert({
        workspace_id: workspaceId,
        thread_id: opts.threadId ?? null,
        channel_id: opts.channelId ?? null,
        sender_type: "agent",
        agent_id: agent.id,
        content: "",
        status: "thinking",
        activities: [],
      })
      .select("id")
      .single();
    const msgId = placeholder?.id as string;

    // 2. Open a run log
    const { data: run } = await supabase
      .from("agent_runs")
      .insert({
        workspace_id: workspaceId,
        agent_id: agent.id,
        thread_id: opts.threadId ?? null,
        trigger: "message",
        status: "running",
        input: opts.userContent.slice(0, 1000),
      })
      .select("id")
      .single();

    try {
      const history = await buildHistory(
        supabase,
        { threadId: opts.threadId, channelId: opts.channelId },
        agent.id
      );
      const memories = await getMemories(supabase, agent, workspaceId);

      const result = await runAgent({
        agent,
        history,
        workspaceName: opts.workspaceName,
        memories,
        connectors,
        onActivity: async (activities) => {
          if (msgId) await supabase.from("messages").update({ activities }).eq("id", msgId);
        },
        onCreateAgent: (spec) => createAgentFromSpec(supabase, workspaceId, opts.createdBy ?? null, spec),
        onDelegate: (handle, task) =>
          delegateToAgent(supabase, {
            workspaceId,
            workspaceName: opts.workspaceName,
            threadId: opts.threadId ?? null,
            channelId: opts.channelId ?? null,
            agents: opts.agents,
            connectors,
            handle,
            task,
          }),
      });

      // 3. Finalize the message (+ attach any created-agent cards)
      if (msgId) {
        const attachments = result.createdAgents.map((c) => ({ type: "agent_created", ...c }));
        await supabase
          .from("messages")
          .update({
            content: result.content,
            activities: result.activities,
            attachments,
            status: "complete",
          })
          .eq("id", msgId);
      }

      // 4. Close the run
      if (run?.id) {
        await supabase
          .from("agent_runs")
          .update({
            status: "done",
            output: result.content.slice(0, 4000),
            steps: result.steps,
            tokens_in: result.tokensIn,
            tokens_out: result.tokensOut,
            finished_at: new Date().toISOString(),
          })
          .eq("id", run.id);
      }

      await supabase.from("agents").update({ last_run_at: new Date().toISOString() }).eq("id", agent.id);

      // 5. Store a long-term memory snippet
      if (agent.memory_enabled) {
        await supabase.from("agent_memories").insert({
          workspace_id: workspaceId,
          agent_id: agent.id,
          kind: "interaction",
          content: `User asked: "${opts.userContent.slice(0, 200)}". I responded with: ${result.content.slice(0, 300)}`,
        });
      }
    } catch (e: any) {
      if (msgId) {
        await supabase
          .from("messages")
          .update({
            content: `⚠️ I ran into an error: ${e.message}. A human may need to step in.`,
            status: "error",
          })
          .eq("id", msgId);
      }
      if (run?.id) {
        await supabase
          .from("agent_runs")
          .update({ status: "error", output: e.message, finished_at: new Date().toISOString() })
          .eq("id", run.id);
      }
    }
  }
}
