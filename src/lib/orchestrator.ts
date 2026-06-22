import type { SupabaseClient } from "@supabase/supabase-js";
import { runAgent } from "./agent-runner";
import type { Agent, Message } from "./types";
import { hasGroqKey, type ChatMessage } from "./groq";
import { AGENT_COLORS } from "./emoji";

/** Agents explicitly @mentioned (by handle or name) in the text. */
export function resolveMentions(content: string, agents: Agent[]): Agent[] {
  const tokens = [...content.matchAll(/@([a-z0-9_-]+)/gi)].map((m) => m[1].toLowerCase());
  if (!tokens.length) return [];
  return agents.filter((a) => {
    const h = (a.handle || "").toLowerCase();
    const n1 = a.name.toLowerCase().replace(/\s+/g, "-");
    const n2 = a.name.toLowerCase().replace(/\s+/g, "");
    return tokens.includes(h) || tokens.includes(n1) || tokens.includes(n2);
  });
}

/** A non-supervisor agent addressed by its bare name (e.g. "max, find ..."). */
function bareNameRef(content: string, agents: Agent[]): Agent | null {
  const lc = content.toLowerCase();
  // Prefer agents whose name appears earliest in the message.
  let best: { a: Agent; idx: number } | null = null;
  for (const a of agents) {
    if (a.is_supervisor) continue;
    const name = a.name.toLowerCase();
    if (name.length < 3) continue;
    const re = new RegExp(`(^|[^a-z0-9])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`);
    const m = re.exec(lc);
    if (m && (best === null || m.index < best.idx)) best = { a, idx: m.index };
  }
  return best?.a ?? null;
}

/** Intents only the supervisor (AgentNexus) should handle. */
function isSupervisorIntent(content: string): boolean {
  const c = content.toLowerCase();
  return (
    /\b(make|create|add|build|spin up|set ?up)\b[^.?!]*\bagent/.test(c) ||
    /\b(get|bring|invite|add)\b[^.?!]*\b(in(to)? (the|this) chat|to the team|here)\b/.test(c) ||
    /\bdelegate\b/.test(c)
  );
}

const NAME_STOP = new Set([
  "agent", "an", "a", "the", "new", "another", "that", "this", "it", "one", "bot",
  "ai", "assistant", "please", "can", "you", "me", "my", "us", "here", "in", "to", "some",
]);

/** Parse the agent name from a create/add request, if any. */
export function parseAgentName(content: string): string | null {
  const hasAgentWord = /\bagent\b/i.test(content);
  const pats: RegExp[] = [
    // "get/bring/add Bob in/into/to/here/for" — clearest "bring this agent in"
    /\b(?:get|bring|invite|put)\s+([A-Za-z][\w-]{1,20})\s+(?:in|into|to|here|for|on)\b/i,
    // "make/create/build an agent (called) Bob"
    /\b(?:make|create|build|spin ?up|set ?up|add)\s+(?:a |an )?(?:new )?agent\s+(?:called |named )?([A-Za-z][\w-]{1,20})/i,
  ];
  // "called/named Bob" only when the message is actually about an agent.
  if (hasAgentWord) pats.push(/\b(?:called|named)\s+([A-Za-z][\w-]{1,20})/i);
  for (const re of pats) {
    const m = re.exec(content);
    if (m && m[1] && !NAME_STOP.has(m[1].toLowerCase())) return m[1];
  }
  return null;
}

/** ALL agents (incl. supervisor / "nexus") addressed by name or @mention. */
function nameRefAll(content: string, agents: Agent[]): Agent[] {
  const lc = content.toLowerCase();
  const out: Agent[] = [];
  for (const a of agents) {
    const aliases = [a.name.toLowerCase(), (a.handle || "").toLowerCase().replace(/-/g, " ")];
    if (a.is_supervisor) aliases.push("nexus", "agent nexus", "agentnexus");
    const hit = aliases.some((al) => {
      if (al.length < 3) return false;
      return new RegExp(`(^|[^a-z0-9])${al.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(lc);
    });
    if (hit) out.push(a);
  }
  return out;
}

function isCreateIntent(content: string): boolean {
  return /\b(make|create|build|add|spin ?up|set ?up|get|bring|invite|need|want)\b/i.test(content);
}

// Every agent gets the full toolset by default — live web search, browser, and
// code (image gen + connectors are added automatically at run time when available).
const FULL_TOOLSET = ["web_search", "browse", "code"];

function inferSpec(name: string, content: string) {
  const c = content.toLowerCase();
  let role = "AI Agent";
  if (/cod(e|ing)|develop|program|engineer|software|\bapp\b|website|build/.test(c)) role = "Software Engineer";
  else if (/research|find|search|analy|investigat|\bdata\b|news|market|stock/.test(c)) role = "Research Analyst";
  else if (/writ|content|blog|copy|email|post|draft/.test(c)) role = "Content Writer";
  else if (/design|image|art|logo|photo|video/.test(c)) role = "Creative";
  return { name, role, description: `${name} is a ${role.toLowerCase()} on the team.`, tools: [...FULL_TOOLSET] };
}

/** Any agent (incl. the supervisor / its "nexus" nickname) addressed by name. */
function nameRef(content: string, agents: Agent[]): Agent | null {
  const lc = content.toLowerCase();
  let best: { a: Agent; idx: number } | null = null;
  for (const a of agents) {
    const aliases = [a.name.toLowerCase(), (a.handle || "").toLowerCase().replace(/-/g, " ")];
    if (a.is_supervisor) aliases.push("nexus", "agent nexus", "agentnexus");
    for (const al of aliases) {
      if (al.length < 3) continue;
      const re = new RegExp(`(^|[^a-z0-9])${al.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`);
      const m = re.exec(lc);
      if (m && (best === null || m.index < best.idx)) best = { a, idx: m.index };
    }
  }
  return best?.a ?? null;
}

export function selectAgents(
  content: string,
  agents: Agent[],
  primaryAgentId?: string | null,
  preferSpecialistId?: string | null
): Agent[] {
  // Explicit @mentions → all of them respond.
  const mentioned = resolveMentions(content, agents);
  if (mentioned.length) return mentioned;

  const supervisor = agents.find((a) => a.is_supervisor) || agents[0];

  // Addressed agents by name (one or several) → all of them respond.
  const named = nameRefAll(content, agents);
  if (named.length) return named;

  // Creating/managing agents otherwise goes to the supervisor.
  if (isSupervisorIntent(content) && supervisor) return [supervisor];

  // Otherwise continue with whichever specialist is active in this thread.
  if (preferSpecialistId) {
    const a = agents.find((x) => x.id === preferSpecialistId && !x.is_supervisor);
    if (a) return [a];
  }
  if (primaryAgentId) {
    const a = agents.find((x) => x.id === primaryAgentId);
    if (a) return [a];
  }
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

  // Long-term memory — shared across the WHOLE workspace (every chat, every
  // agent), so any agent (incl. brand-new ones) remembers what's been discussed.
  if (agent.memory_enabled) {
    const { data } = await supabase
      .from("agent_memories")
      .select("content")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(24);
    const seen = new Set<string>();
    for (const m of (data as { content: string }[]) || []) {
      const c = (m.content || "").trim();
      if (c && !seen.has(c)) { seen.add(c); out.push(c); }
    }
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
      roster: o.agents.map((a) => ({ name: a.name, role: a.role, handle: a.handle, isSupervisor: a.is_supervisor })),
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

const MAX_FANOUT_DEPTH = 1;

/** Run the selected agent(s) for a freshly-posted user message. Awaits completion. */
export async function dispatch(opts: DispatchOpts): Promise<void> {
  const { supabase, workspaceId } = opts;
  const connectors = await getConnectors(supabase, workspaceId);

  // Most-recent non-supervisor agent active in this thread/channel — generic
  // tasks continue with them (e.g. once "Max" joins, research goes to Max).
  let preferSpecialistId: string | null = null;
  if (opts.threadId || opts.channelId) {
    let q = supabase
      .from("messages")
      .select("agent_id")
      .eq("sender_type", "agent")
      .not("agent_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(12);
    if (opts.threadId) q = q.eq("thread_id", opts.threadId);
    else q = q.eq("channel_id", opts.channelId!).is("thread_id", null);
    const { data } = await q;
    const supIds = new Set(opts.agents.filter((a) => a.is_supervisor).map((a) => a.id));
    for (const r of (data as { agent_id: string }[]) || []) {
      if (r.agent_id && !supIds.has(r.agent_id)) { preferSpecialistId = r.agent_id; break; }
    }
  }

  const supervisor = opts.agents.find((a) => a.is_supervisor);
  let agentsList = opts.agents;
  const newlyCreated: Agent[] = [];

  // Deterministic agent creation / bring-in — if the user names a NEW agent to
  // add/get, create it (don't rely on the model), announce it, and let it join.
  const reqName = isCreateIntent(opts.userContent) ? parseAgentName(opts.userContent) : null;
  if (reqName && hasGroqKey()) {
    const existing = agentsList.find(
      (a) => a.name.toLowerCase() === reqName.toLowerCase() || (a.handle || "").toLowerCase() === reqName.toLowerCase()
    );
    if (!existing) {
      const niceName = reqName.charAt(0).toUpperCase() + reqName.slice(1);
      const card = await createAgentFromSpec(supabase, workspaceId, opts.createdBy ?? null, inferSpec(niceName, opts.userContent));
      if (card) {
        await supabase.from("messages").insert({
          workspace_id: workspaceId,
          thread_id: opts.threadId ?? null,
          channel_id: opts.channelId ?? null,
          sender_type: "agent",
          agent_id: supervisor?.id ?? card.id,
          content: `Done — I've added **${card.name}** to the team! 🎉 ${card.role ? `They're set up as a ${card.role}.` : ""}`,
          attachments: [{ type: "agent_created", ...card }],
          status: "complete",
        });
        const { data: full } = await supabase.from("agents").select("*").eq("id", card.id).maybeSingle();
        if (full) {
          agentsList = [...agentsList, full as Agent];
          newlyCreated.push(full as Agent);
        }
      }
    }
  }

  const opts2 = { ...opts, agents: agentsList };
  // Responders = any newly-created agent + everyone selected (mentions/names/etc).
  const selected = selectAgents(opts.userContent, agentsList, opts.primaryAgentId, preferSpecialistId);
  const responders: Agent[] = [];
  const seen = new Set<string>();
  for (const a of [...newlyCreated, ...selected]) {
    if (!seen.has(a.id)) { seen.add(a.id); responders.push(a); }
  }

  const triggered = new Set<string>();
  for (const agent of responders) {
    await runOneAgent(opts2, connectors, agent, opts.userContent, 0, triggered);
  }
}

async function runOneAgent(
  opts: DispatchOpts,
  connectors: Record<string, string>,
  agent: Agent,
  triggerText: string,
  depth: number,
  triggered: Set<string>
): Promise<void> {
  const { supabase, workspaceId } = opts;
  if (triggered.has(agent.id)) return;
  triggered.add(agent.id);

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
    return;
  }

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

  const { data: run } = await supabase
    .from("agent_runs")
    .insert({
      workspace_id: workspaceId,
      agent_id: agent.id,
      thread_id: opts.threadId ?? null,
      trigger: "message",
      status: "running",
      input: triggerText.slice(0, 1000),
    })
    .select("id")
    .single();

  try {
    const history = await buildHistory(supabase, { threadId: opts.threadId, channelId: opts.channelId }, agent.id);
    const memories = await getMemories(supabase, agent, workspaceId);

    const result = await runAgent({
      agent,
      history,
      workspaceName: opts.workspaceName,
      memories,
      roster: opts.agents.map((a) => ({ name: a.name, role: a.role, handle: a.handle, isSupervisor: a.is_supervisor })),
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

    if (msgId) {
      const attachments = [
        ...result.createdAgents.map((c) => ({ type: "agent_created", ...c })),
        ...result.generatedImages.map((url) => ({ type: "image", url, name: "Generated image" })),
      ];
      await supabase
        .from("messages")
        .update({ content: result.content, activities: result.activities, attachments, status: "complete" })
        .eq("id", msgId);
    }

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

    if (agent.memory_enabled) {
      await supabase.from("agent_memories").insert({
        workspace_id: workspaceId,
        agent_id: agent.id,
        kind: "interaction",
        // Store only what the USER said (facts to remember) — never the agent's own
        // wording, which made agents parrot their previous replies.
        content: `User mentioned: "${triggerText.slice(0, 220)}"`,
      });
    }

    // Fan-out: only when this agent @mentioned exactly ONE other agent (a real
    // handoff). Multiple mentions = a list/summary (e.g. the team roster) → skip.
    if (depth < MAX_FANOUT_DEPTH) {
      const mentioned = resolveMentions(result.content, opts.agents).filter(
        (m) => m.id !== agent.id && !triggered.has(m.id)
      );
      if (mentioned.length === 1) {
        await runOneAgent(opts, connectors, mentioned[0], result.content, depth + 1, triggered);
      }
    }
  } catch (e: any) {
    const msg = e?.message || e?.error?.error?.message || String(e);
    const rate = /429|rate limit|tokens per day|\bTPD\b/i.test(msg);
    const friendly = rate
      ? "⚡ We've hit today's free shared AI usage limit (across all models). Add your own free Groq key in **Settings → Groq API key** (console.groq.com/keys) for your own quota, or try again later."
      : `⚠️ I ran into an error: ${msg}. A human may need to step in.`;
    if (msgId) {
      await supabase.from("messages").update({ content: friendly, status: "error" }).eq("id", msgId);
    }
    if (run?.id) {
      await supabase
        .from("agent_runs")
        .update({ status: "error", output: e.message, finished_at: new Date().toISOString() })
        .eq("id", run.id);
    }
  }
}
