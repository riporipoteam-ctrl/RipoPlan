import type { SupabaseClient } from "@supabase/supabase-js";
import { runAgent } from "./agent-runner";
import type { Agent, Message } from "./types";
import type { ChatMessage } from "./groq";

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
    .filter((m) => m.status !== "thinking" && m.content)
    .map<ChatMessage>((m) => ({
      role: m.sender_type === "user" ? "user" : "assistant",
      content:
        m.sender_type === "agent" && m.agent_id !== selfAgentId
          ? `[from another agent] ${m.content}`
          : (m.content as string),
    }));
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
}

/** Run the selected agent(s) for a freshly-posted user message. Awaits completion. */
export async function dispatch(opts: DispatchOpts): Promise<void> {
  const { supabase, workspaceId } = opts;
  const selected = selectAgents(opts.userContent, opts.agents, opts.primaryAgentId);

  for (const agent of selected) {
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
        onActivity: async (activities) => {
          if (msgId) await supabase.from("messages").update({ activities }).eq("id", msgId);
        },
      });

      // 3. Finalize the message
      if (msgId) {
        await supabase
          .from("messages")
          .update({
            content: result.content,
            activities: result.activities,
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
