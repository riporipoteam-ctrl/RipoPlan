import type { SupabaseClient } from "@supabase/supabase-js";
import { runAgent } from "./agent-runner";
import type { Agent, Message } from "./types";
import { hasGroqKey, type ChatMessage } from "./groq";
import { AGENT_COLORS } from "./emoji";
import { hasBackend } from "./backend";
import { isBackgroundIntent, enqueueBackgroundTask } from "./background";

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

/** User wants a website / web app / landing page / tool built. */
function isBuildAppIntent(content: string): boolean {
  const c = content.toLowerCase();
  return (
    /\b(website|web ?app|web ?page|landing page|web ?site|html (page|site)|mini ?app|portfolio site|online store|web tool)\b/.test(c) &&
    /\b(make|create|build|design|code|develop|need|want|generate|set ?up)\b/.test(c)
  );
}

// Every agent gets the full toolset by default — live web search, browser, and
// code (image gen + connectors are added automatically at run time when available).
const FULL_TOOLSET = ["web_search", "browse", "code"];

// Distinct personalities per role so created agents feel like real teammates,
// not interchangeable bots. Each gets its own voice, strengths, and quirks.
const PERSONAS: Record<string, { traits: string; voice: string }> = {
  "Software Engineer": {
    traits: "pragmatic, detail-obsessed, loves clean code and shipping working software",
    voice: "Explain your approach briefly, then deliver. Use code blocks. Call out trade-offs and edge cases.",
  },
  "Research Analyst": {
    traits: "curious, rigorous, skeptical of unsourced claims",
    voice: "Always search before answering, cite real sources with links, and present findings in tidy Markdown tables.",
  },
  "Content Writer": {
    traits: "creative, sharp, with a strong sense of voice and rhythm",
    voice: "Write with personality and clarity. Match the requested tone. No filler, no clichés.",
  },
  "Creative": {
    traits: "imaginative, visual, bold with ideas",
    voice: "Think in concepts and moodboards. Offer a few distinct directions before committing.",
  },
  "AI Agent": {
    traits: "resourceful, proactive, gets things done",
    voice: "Be direct and useful. Use your tools when they genuinely help.",
  },
};

function inferSpec(name: string, content: string) {
  const c = content.toLowerCase();
  let role = "AI Agent";
  if (/cod(e|ing)|develop|program|engineer|software|\bapp\b|website|build/.test(c)) role = "Software Engineer";
  else if (/research|find|search|analy|investigat|\bdata\b|news|market|stock/.test(c)) role = "Research Analyst";
  else if (/writ|content|blog|copy|email|post|draft/.test(c)) role = "Content Writer";
  else if (/design|image|art|logo|photo|video/.test(c)) role = "Creative";
  const p = PERSONAS[role] || PERSONAS["AI Agent"];
  const description = `${name} — a ${role.toLowerCase()} who is ${p.traits}.`;
  const persona = `You are ${name}, a ${role} on this team. Personality: ${p.traits}. ${p.voice} You have your own distinct voice and opinions — never sound generic. Speak ONLY as ${name}; never write other agents' or the user's lines.`;
  return { name, role, description, persona, tools: [...FULL_TOOLSET] };
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
      system_prompt:
        spec.persona ||
        `You are ${spec.name || "an agent"}, ${spec.role || "an AI agent"}. ${spec.description || ""} Have a distinct personality and voice. Use your tools to do real work and answer clearly in markdown. Speak only as yourself.`,
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
      onBuildApp: (spec) =>
        buildAppRecord(supabase, { workspaceId: o.workspaceId, createdBy: null, agentId: target.id, channelId: o.channelId, spec }),
    });
    if (mid) {
      const attachments = [
        ...res.generatedImages.map((url) => ({ type: "image", url, name: "Generated image" })),
        ...res.builtApps.map((a) => ({ type: "mini_app", id: a.id, name: a.name })),
      ];
      await supabase.from("messages").update({ content: res.content, activities: res.activities, attachments, status: "complete" }).eq("id", mid);
    }
    return res.content;
  } catch (e: any) {
    if (mid) await supabase.from("messages").update({ content: `⚠️ ${e.message}`, status: "error" }).eq("id", mid);
    return "";
  }
}

/** Publish a self-contained web app/site built by an agent to the Mini Apps page. */
async function buildAppRecord(
  supabase: SupabaseClient,
  o: { workspaceId: string; createdBy: string | null; agentId: string; channelId: string | null; spec: { name: string; description?: string; html: string } }
): Promise<{ id: string; name: string } | null> {
  const { data, error } = await supabase
    .from("mini_apps")
    .insert({
      workspace_id: o.workspaceId,
      name: o.spec.name || "Web App",
      description: o.spec.description || null,
      html: o.spec.html || "",
      built_by: o.agentId,
      channel_id: o.channelId,
      status: "ready",
      created_by: o.createdBy,
    })
    .select("id,name")
    .single();
  if (error || !data) return null;
  return { id: data.id, name: data.name };
}

/** Ensure every workspace has a default Coder agent that can build apps. */
async function ensureCodeAgent(supabase: SupabaseClient, workspaceId: string, createdBy: string | null): Promise<Agent | null> {
  const { data: existing } = await supabase
    .from("agents")
    .select("*")
    .eq("workspace_id", workspaceId)
    .or("handle.eq.coder,handle.eq.builder")
    .neq("status", "archived")
    .limit(1)
    .maybeSingle();
  if (existing) {
    // Make sure it can publish apps.
    const tools: string[] = Array.isArray((existing as Agent).tools) ? (existing as Agent).tools : [];
    if (!tools.includes("build_app")) {
      await supabase.from("agents").update({ tools: [...tools, "build_app"] }).eq("id", (existing as Agent).id);
      (existing as Agent).tools = [...tools, "build_app"];
    }
    return existing as Agent;
  }
  const { data } = await supabase
    .from("agents")
    .insert({
      workspace_id: workspaceId,
      name: "Coder",
      handle: "coder",
      role: "Software Engineer",
      description: "Builds websites and web apps and publishes them to Mini Apps.",
      emoji: "code",
      avatar_color: "#6e5494",
      tools: ["web_search", "browse", "code", "build_app"],
      system_prompt:
        "You are Coder, a senior software engineer. When asked to build a website or web app, write a complete, polished, responsive single-file HTML document (inline CSS + JS) and PUBLISH it with the build_app tool instead of pasting code in chat. Ask a clarifying question only if essential. Have a pragmatic, friendly engineer personality. Speak only as yourself.",
      created_by: createdBy,
    })
    .select("*")
    .maybeSingle();
  return (data as Agent) || null;
}

const RANK_BADGE_WORDS = ["crown","star","shield","medal","gem","fire","trophy","flag","diamond","bolt","rocket","brain"];

/** AgentNexus manages ranks from chat: create / assign / edit. */
async function handleRankAction(
  supabase: SupabaseClient,
  o: { workspaceId: string; agents: Agent[] },
  action: string,
  args: any
): Promise<string> {
  const ws = o.workspaceId;
  const badge = RANK_BADGE_WORDS.includes(String(args.badge || "").toLowerCase()) ? String(args.badge).toLowerCase() : undefined;
  const findRank = async (name: string) => {
    const { data } = await supabase.from("ranks").select("*").eq("workspace_id", ws);
    return ((data as any[]) || []).find((r) => r.name.toLowerCase() === String(name || "").toLowerCase()) || null;
  };
  if (action === "create_rank") {
    const { data, error } = await supabase
      .from("ranks")
      .insert({ workspace_id: ws, name: args.name || "New Rank", badge: badge || "star", color: args.color || "#a855f7", position: 100 })
      .select("name,badge")
      .single();
    if (error || !data) return "";
    return `Created the **${data.name}** rank.`;
  }
  if (action === "edit_rank") {
    const rank = await findRank(args.rank);
    if (!rank) return `I couldn't find a rank called "${args.rank}".`;
    const patch: any = {};
    if (args.name) patch.name = args.name;
    if (badge) patch.badge = badge;
    if (args.color) patch.color = args.color;
    if (!Object.keys(patch).length) return `Nothing to change on "${rank.name}".`;
    await supabase.from("ranks").update(patch).eq("id", rank.id);
    return `Updated the **${patch.name || rank.name}** rank.`;
  }
  // assign_rank
  const agent = o.agents.find(
    (a) => a.name.toLowerCase() === String(args.agent || "").toLowerCase() || (a.handle || "").toLowerCase() === String(args.agent || "").toLowerCase()
  );
  if (!agent) return `I couldn't find an agent called "${args.agent}".`;
  if (!String(args.rank || "").trim()) {
    await supabase.from("agents").update({ rank_id: null }).eq("id", agent.id);
    return `Removed ${agent.name}'s rank.`;
  }
  const rank = await findRank(args.rank);
  if (!rank) return `I couldn't find a rank called "${args.rank}". Create it first.`;
  await supabase.from("agents").update({ rank_id: rank.id }).eq("id", agent.id);
  return `${agent.name} is now **${rank.name}**.`;
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

  // Build-a-website/app request → ensure the Coder agent exists and let it
  // handle it directly (it has the build_app tool and publishes to Mini Apps).
  let buildAgent: Agent | null = null;
  const explicitMention = resolveMentions(opts.userContent, agentsList).length > 0 || nameRefAll(opts.userContent, agentsList).length > 0;
  if (isBuildAppIntent(opts.userContent) && hasGroqKey() && !explicitMention) {
    buildAgent = await ensureCodeAgent(supabase, workspaceId, opts.createdBy ?? null);
    if (buildAgent && !agentsList.some((a) => a.id === buildAgent!.id)) {
      agentsList = [...agentsList, buildAgent];
    }
  }

  const opts2 = { ...opts, agents: agentsList };
  // Responders = any newly-created agent + everyone selected (mentions/names/etc).
  const selected = buildAgent ? [buildAgent] : selectAgents(opts.userContent, agentsList, opts.primaryAgentId, preferSpecialistId);
  const responders: Agent[] = [];
  const seen = new Set<string>();
  for (const a of [...newlyCreated, ...selected]) {
    if (!seen.has(a.id)) { seen.add(a.id); responders.push(a); }
  }

  // "Keep working even if I close the app" → hand off to the Cloudflare Worker,
  // which runs the agent on a cron server-side and fills in the reply later.
  if (isBackgroundIntent(opts.userContent) && hasBackend() && hasGroqKey() && responders.length) {
    const responder = responders[0];
    const { data: ph } = await supabase
      .from("messages")
      .insert({
        workspace_id: workspaceId,
        thread_id: opts.threadId ?? null,
        channel_id: opts.channelId ?? null,
        sender_type: "agent",
        agent_id: responder.id,
        content: "",
        status: "thinking",
        activities: [{ label: "Working in the background — you can close the app", status: "running" }],
      })
      .select("id")
      .single();
    const ok = await enqueueBackgroundTask(supabase, {
      workspaceId,
      agentId: responder.id,
      threadId: opts.threadId ?? null,
      channelId: opts.channelId ?? null,
      messageId: ph?.id ?? null,
      prompt: opts.userContent,
      createdBy: opts.createdBy ?? null,
    });
    if (ok) return;
    // Couldn't enqueue → fall through to running inline.
    if (ph?.id) await supabase.from("messages").delete().eq("id", ph.id);
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
      onRankAction: (action, args) => handleRankAction(supabase, { workspaceId, agents: opts.agents }, action, args),
      onBuildApp: (spec) =>
        buildAppRecord(supabase, {
          workspaceId,
          createdBy: opts.createdBy ?? null,
          agentId: agent.id,
          channelId: opts.channelId ?? null,
          spec,
        }),
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
        ...result.builtApps.map((a) => ({ type: "mini_app", id: a.id, name: a.name })),
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
