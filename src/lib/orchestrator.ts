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
  "her", "him", "them", "they", "he", "she", "his", "hers", "their", "everyone", "someone",
  "anybody", "somebody", "out", "back", "up", "over", "all", "guys", "everybody",
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
    if (a.is_supervisor) aliases.push("askai", "ask ai", "nexus", "agent nexus", "agentnexus");
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

/** Decide if a user message contains a durable fact worth remembering, and return
 * the concise fact to store — otherwise null (so we don't save every message). */
function extractMemorable(text: string): string | null {
  const t = (text || "").trim();
  if (t.length < 4) return null;
  // Explicit "remember ..." request.
  const rem = t.match(/\bremember(?:\s+that)?\s*:?\s*(.+)/i);
  if (rem && rem[1].trim().length > 2) return rem[1].trim().slice(0, 240);
  // Personal facts / preferences that are useful long-term.
  if (/\b(my name is|call me|i am |i'?m |i live|i'?m from|i work|i'?m a |my (job|role|company|email|number|birthday|favou?rite|goal|budget|timezone)|i (like|love|prefer|hate|always|never|usually)|we (use|prefer|need))\b/i.test(t)) {
    return t.replace(/\s+/g, " ").slice(0, 240);
  }
  return null;
}

/** Who should reply next: a single teammate addressed by @mention, or by name at
 * the very start of the message ("Ilma, …" / "Hey Ilma!"). Null if none/ambiguous. */
function handoffTarget(content: string, agents: Agent[], selfId: string): Agent | null {
  const mentioned = resolveMentions(content, agents).filter((a) => a.id !== selfId);
  if (mentioned.length === 1) return mentioned[0];
  if (mentioned.length > 1) return null;
  const lead = content.replace(/^[\s>*_#-]+/, "").slice(0, 48).toLowerCase();
  let best: Agent | null = null;
  for (const a of agents) {
    if (a.id === selfId || a.is_supervisor) continue;
    const name = a.name.toLowerCase();
    if (name.length < 3) continue;
    if (new RegExp(`^(hey |ok |okay |alright |yo |so )?${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[,!:]`).test(lead)) {
      if (best) return null; // more than one → ambiguous
      best = a;
    }
  }
  return best;
}

/** User wants a website / web app / landing page / tool built. */
function isBuildAppIntent(content: string): boolean {
  const c = content.toLowerCase();
  return (
    /\b(website|web ?app|web ?page|landing page|web ?site|html (page|site)|mini ?app|portfolio site|online store|web tool)\b/.test(c) &&
    /\b(make|create|build|design|code|develop|need|want|generate|set ?up)\b/.test(c)
  );
}

/** User wants EVERY agent to respond (e.g. "get every agent to say hi"). */
function isAllAgentsIntent(content: string): boolean {
  const c = content.toLowerCase();
  return /\b(every|all|each)\s+(agent|one|bot)\b|\beveryone\b|\ball of (you|them|the agents)\b|\bwhole team\b|\bentire team\b/.test(c);
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
    if (a.is_supervisor) aliases.push("askai", "ask ai", "nexus", "agent nexus", "agentnexus");
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
  selfAgentId: string,
  agents: Agent[],
  userName?: string
): Promise<ChatMessage[]> {
  let q = supabase.from("messages").select("*").order("created_at", { ascending: true }).limit(30);
  if (opts.threadId) q = q.eq("thread_id", opts.threadId);
  else if (opts.channelId) q = q.eq("channel_id", opts.channelId).is("thread_id", null);
  const { data } = await q;
  const rows = (data as Message[]) || [];
  const nameOf = new Map(agents.map((a) => [a.id, a.name]));
  return rows
    .filter((m) => m.status !== "thinking" && (m.content || (m.attachments && m.attachments.length)))
    .map<ChatMessage>((m) => {
      // Only THIS agent's own past messages are "assistant" (its own voice, plain).
      // Everyone else — the human AND other agents — appears as an incoming "user"
      // turn labelled with their name, so the model RESPONDS to them and never
      // continues/echoes/impersonates them.
      const isSelf = m.sender_type === "agent" && m.agent_id === selfAgentId;
      const who = m.sender_type === "user" ? (userName || "User") : nameOf.get(m.agent_id || "") || "Teammate";
      const body = (m.content as string) || "";
      const role: "assistant" | "user" = isSelf ? "assistant" : "user";
      const text = isSelf ? body : `${who}: ${body}`;
      // Multimodal: include image attachments so vision-capable models can see them.
      const images = (m.attachments || []).filter((a: any) => a?.type === "image" && a.url);
      if (role === "user" && images.length) {
        return {
          role,
          content: [
            { type: "text", text: text || `${who}: (see attached image)` },
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
  userName?: string | null;
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

/** Derive a short channel/task title from the user's build request. */
function buildTitle(content: string): string {
  let t = content
    .replace(/^.*?\b(build|make|create|design|code|develop|generate|set ?up)\b\s+(me\s+)?(a|an|the)?\s*/i, "")
    .replace(/\b(website|web ?app|web ?site|web ?page|landing page|app|site|page)\b.*$/i, "$1")
    .replace(/[^\w\s-]/g, "")
    .trim();
  if (!t) t = "New Website";
  t = t.split(/\s+/).slice(0, 5).join(" ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Pull a complete HTML document out of an agent's message (when it pasted code
 * instead of calling build_app), so we can publish it to Mini Apps anyway. */
function extractHtmlDoc(text: string): string | null {
  if (!text) return null;
  // Prefer a complete document.
  const closed = text.match(/(<!doctype html[\s\S]*?<\/html>)/i) || text.match(/(<html[\s\S]*?<\/html>)/i);
  if (closed) return closed[1];
  // Truncated output (model ran out of tokens, no </html>): take from the start
  // marker to the end and auto-close so it still renders.
  const startIdx = (() => {
    const a = text.search(/<!doctype html/i);
    if (a >= 0) return a;
    const b = text.search(/<html[\s>]/i);
    return b;
  })();
  if (startIdx >= 0) {
    let html = text.slice(startIdx).replace(/```[\s\S]*$/, "").trim();
    if (!/<\/html>/i.test(html)) {
      if (!/<\/body>/i.test(html)) html += "\n</body>";
      html += "\n</html>";
    }
    return html;
  }
  // A big fenced code block with CSS/markup but no <html> wrapper → wrap it.
  const fence = text.match(/```(?:html|css|js)?\s*([\s\S]{200,})```/i) || text.match(/```(?:html|css|js)?\s*([\s\S]{200,})$/i);
  if (fence && /<\w+[\s>]|{[\s\S]*}/.test(fence[1])) {
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${fence[1]}</body></html>`;
  }
  return null;
}

/**
 * Full build flow: AskAI researches & writes a brief, opens a dedicated channel,
 * briefs the Coder there, and the Coder builds a polished site that's published
 * to Mini Apps — then AskAI reports back in the original chat.
 */
async function runBuildFlow(opts: DispatchOpts, connectors: Record<string, string>): Promise<void> {
  const { supabase, workspaceId } = opts;
  const supervisor = opts.agents.find((a) => a.is_supervisor) || opts.agents[0];
  // Use an explicitly-mentioned coding agent if there is one, else the default Coder.
  const mentionedCoder = resolveMentions(opts.userContent, opts.agents).find((a) => !a.is_supervisor && /cod|build|dev|engineer|program/i.test(`${a.role || ""} ${a.name}`));
  const coder = mentionedCoder || (await ensureCodeAgent(supabase, workspaceId, opts.createdBy ?? null));
  if (!supervisor || !coder) return;

  const agents = opts.agents.some((a) => a.id === coder.id) ? opts.agents : [...opts.agents, coder];
  const roster = agents.map((a) => ({ name: a.name, role: a.role, handle: a.handle, isSupervisor: a.is_supervisor }));
  const title = buildTitle(opts.userContent);

  const postHere = (agentId: string, content: string, attachments: any[] = []) =>
    supabase.from("messages").insert({
      workspace_id: workspaceId,
      thread_id: opts.threadId ?? null,
      channel_id: opts.channelId ?? null,
      sender_type: "agent",
      agent_id: agentId,
      content,
      attachments,
      status: "complete",
    });

  // 1) AskAI thinks/researches and writes a detailed build brief (silently).
  // Restrict tools to research only so it can't spin up stray agents here.
  const briefAgent: Agent = { ...supervisor, tools: ["web_search", "browse"] };
  let brief = "";
  try {
    const briefRes = await runAgent({
      agent: briefAgent,
      history: [
        {
          role: "user",
          content:
            `The user asked: "${opts.userContent}". You are the project lead. Research anything useful (search the web if it helps), then write a DETAILED build brief for our coding agent to build a top-tier single-page website/web app. Include: goal & audience; the sections/pages in order; concrete copy/text for each section; a colour palette (hex) and font pairing; layout & visual style; key interactions/animations; and 4-8 specific royalty-free image URLs using the form https://source.unsplash.com/1600x900/?KEYWORD (pick good keywords). Be concrete and opinionated. Output ONLY the brief in Markdown.`,
        },
      ],
      workspaceName: opts.workspaceName,
      roster,
      connectors,
      maxTokens: 2200,
    });
    brief = briefRes.content;
  } catch {
    brief = `Build a polished, modern single-page site for: "${opts.userContent}". Clean responsive layout, strong hero, multiple sections, royalty-free imagery from https://source.unsplash.com, subtle animations.`;
  }

  // 2) Open a dedicated channel for the task.
  const { data: ch } = await supabase
    .from("channels")
    .insert({ workspace_id: workspaceId, name: title, description: `Build task — ${opts.userContent.slice(0, 120)}`, created_by: opts.createdBy ?? null })
    .select("id,name")
    .single();
  const channelId = (ch as any)?.id as string;
  const channelName = (ch as any)?.name as string;

  // 3) Tell the user (in the original chat) what's happening.
  await postHere(
    supervisor.id,
    `On it! 🛠️ I dug into this and put together a full brief, then opened a dedicated channel **#${channelName || title}** and handed it to **${coder.name}** to build. I'll drop the finished site here the moment it's live — you can also follow along in the channel.`
  );

  // 4) Post the brief in the new channel and @mention the coder.
  if (channelId) {
    await supabase.from("messages").insert({
      workspace_id: workspaceId,
      channel_id: channelId,
      sender_type: "agent",
      agent_id: supervisor.id,
      content: `Hey @${coder.handle} — new build for us. Here's the full brief:\n\n${brief}\n\nMake it genuinely excellent. Ask me here if anything's unclear, otherwise ship it and publish to Mini Apps.`,
      status: "complete",
    });
  }

  // 5) Coder builds it (more room to think + write a big, high-quality file).
  const placeholder = channelId
    ? (await supabase.from("messages").insert({
        workspace_id: workspaceId,
        channel_id: channelId,
        sender_type: "agent",
        agent_id: coder.id,
        content: "",
        status: "thinking",
        activities: [{ label: "Designing & coding the site", status: "running" }],
      }).select("id").single()).data
    : null;
  const mid = (placeholder as any)?.id as string | undefined;

  let built: { id: string; name: string } | null = null;
  try {
    // Override the coder's persona so it ONLY publishes via build_app (never pastes code).
    const coderForBuild: Agent = {
      ...coder,
      tools: Array.from(new Set([...(coder.tools || []), "build_app", "web_search", "browse", "code"])),
      system_prompt:
        `You are ${coder.name}, an elite senior web engineer. You build complete, polished, single-file websites. ` +
        `ABSOLUTE RULE: you MUST deliver by calling the build_app tool with the entire HTML document in the "html" argument. ` +
        `NEVER paste HTML, CSS or JS into the chat — your visible message must be only a short sentence like "Done — published to Mini Apps ✅". ` +
        `Inline ALL CSS and JS into ONE <!doctype html> file. Use the provided https://source.unsplash.com image URLs. ` +
        `Make it genuinely one of the best sites you've built: responsive, modern, accessible, multiple real sections, smooth scroll-in animations, hover effects, polished typography and spacing. ` +
        `CRITICAL: the document MUST be COMPLETE and valid — every tag closed, ending with </html>. Keep it focused (roughly under 550 lines) so it finishes in one go rather than getting cut off. A complete, working page beats an unfinished long one.`,
    };
    const res = await runAgent({
      agent: coderForBuild,
      history: [
        {
          role: "user",
          content:
            `Build this now from the brief below. Call build_app ONCE with the FULL, COMPLETE self-contained HTML document (must end with </html> — do not get cut off; keep it focused). Do NOT paste any code in chat. Use the suggested images. No lorem-ipsum where real copy was given.\n\nBRIEF:\n${brief}`,
        },
      ],
      workspaceName: opts.workspaceName,
      roster,
      connectors,
      maxTokens: 8000,
      onActivity: async (activities) => {
        if (mid) await supabase.from("messages").update({ activities }).eq("id", mid);
      },
      onBuildApp: (spec) =>
        buildAppRecord(supabase, { workspaceId, createdBy: opts.createdBy ?? null, agentId: coder.id, channelId, spec }),
    });
    built = res.builtApps[0] || null;
    // Safety net: if the coder pasted HTML instead of calling build_app, publish it ourselves.
    if (!built) {
      const html = extractHtmlDoc(res.content);
      if (html) built = await buildAppRecord(supabase, { workspaceId, createdBy: opts.createdBy ?? null, agentId: coder.id, channelId, spec: { name: title, html } });
    }
    if (mid) {
      // Never show raw code in chat — replace with a clean confirmation + the app card.
      const cleanMsg = built ? `Done — I built **${built.name}** and published it to Mini Apps ✅` : (res.content || "Working on it…");
      const attachments = built ? [{ type: "mini_app", id: built.id, name: built.name }] : [];
      await supabase.from("messages").update({ content: cleanMsg, activities: res.activities, attachments, status: "complete" }).eq("id", mid);
    }
  } catch (e: any) {
    if (mid) await supabase.from("messages").update({ content: `⚠️ Hit a snag building it: ${e.message}`, status: "error" }).eq("id", mid);
  }

  // 6) Report back in the original chat.
  if (built) {
    await postHere(
      supervisor.id,
      `✅ Done! **${built.name}** is live — open it in **Mini Apps** to preview, view or tweak the code. ${coder.name} and I built it over in #${channelName || title}.`,
      [{ type: "mini_app", id: built.id, name: built.name }]
    );
  } else {
    await postHere(supervisor.id, `We ran into trouble finishing the build — take a look in #${channelName || title} and let me know how you'd like to proceed.`);
  }
}

/** User wants to change/fix/expand an EXISTING site (a follow-up after a build). */
function isEditAppIntent(content: string): boolean {
  const c = content.toLowerCase();
  const change = /\b(fix|expand|improve|update|change|edit|redo|tweak|polish|add (to|more|another)|continue (on|with)|make (it|the site|the website)|more (updates|features|sections))\b/.test(c);
  const target = /\b(website|web ?app|web ?site|web ?page|landing page|the site|the page|the app|mini ?app|it)\b/.test(c);
  return change && target;
}

/** Re-run the Coder to UPDATE the most recent published site, in its channel. */
async function runUpdateFlow(opts: DispatchOpts, connectors: Record<string, string>): Promise<boolean> {
  const { supabase, workspaceId } = opts;
  const { data: apps } = await supabase
    .from("mini_apps")
    .select("id,name,html,channel_id")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(1);
  const app = (apps as any[])?.[0];
  if (!app) return false; // nothing built yet → let normal chat handle it

  const supervisor = opts.agents.find((a) => a.is_supervisor) || opts.agents[0];
  const coder = await ensureCodeAgent(supabase, workspaceId, opts.createdBy ?? null);
  if (!supervisor || !coder) return false;
  const roster = opts.agents.map((a) => ({ name: a.name, role: a.role, handle: a.handle, isSupervisor: a.is_supervisor }));

  // Reuse the app's channel (or create one).
  let channelId: string | null = app.channel_id;
  let channelName = app.name;
  if (!channelId) {
    const { data: ch } = await supabase.from("channels").insert({ workspace_id: workspaceId, name: app.name, description: `Updates — ${app.name}`, created_by: opts.createdBy ?? null }).select("id,name").single();
    channelId = (ch as any)?.id; channelName = (ch as any)?.name;
  }

  await supabase.from("messages").insert({
    workspace_id: workspaceId, thread_id: opts.threadId ?? null, channel_id: opts.channelId ?? null,
    sender_type: "agent", agent_id: supervisor.id, status: "complete",
    content: `Got it — I'll have **${coder.name}** update **${app.name}** with that over in #${channelName}. I'll post the new version here when it's ready.`,
  });
  await supabase.from("messages").insert({
    workspace_id: workspaceId, channel_id: channelId, sender_type: "agent", agent_id: supervisor.id, status: "complete",
    content: `@${coder.handle} — the user wants changes to **${app.name}**:\n\n"${opts.userContent}"\n\nUpdate the current site and republish the COMPLETE updated HTML.`,
  });

  const { data: ph } = await supabase.from("messages").insert({
    workspace_id: workspaceId, channel_id: channelId, sender_type: "agent", agent_id: coder.id,
    content: "", status: "thinking", activities: [{ label: "Updating the site", status: "running" }],
  }).select("id").single();
  const mid = (ph as any)?.id as string | undefined;

  const updateApp = async (html: string) => {
    await supabase.from("mini_apps").update({ html, updated_at: new Date().toISOString() }).eq("id", app.id);
    return { id: app.id as string, name: app.name as string };
  };

  let done: { id: string; name: string } | null = null;
  try {
    const coderForBuild: Agent = {
      ...coder,
      tools: Array.from(new Set([...(coder.tools || []), "build_app", "web_search", "browse", "code"])),
      system_prompt: `You are ${coder.name}, an elite web engineer. Update the user's existing single-file website and republish the COMPLETE updated HTML via build_app (full <!doctype html> document, all CSS/JS inline). NEVER paste code in chat — your visible message is just a short "Updated ✅". Keep everything that worked, apply the requested changes, and make sure the file is complete and valid.`,
    };
    const res = await runAgent({
      agent: coderForBuild,
      history: [{ role: "user", content: `Current site HTML:\n\n${String(app.html || "").slice(0, 20000)}\n\nApply these changes and republish the FULL updated HTML via build_app:\n"${opts.userContent}"` }],
      workspaceName: opts.workspaceName, roster, connectors, maxTokens: 8000,
      onActivity: async (a) => { if (mid) await supabase.from("messages").update({ activities: a }).eq("id", mid); },
      onBuildApp: (spec) => updateApp(spec.html),
    });
    done = res.builtApps[0] || null;
    if (!done) { const html = extractHtmlDoc(res.content); if (html) done = await updateApp(html); }
    if (mid) {
      const cleanMsg = done ? `Updated **${done.name}** ✅ — refresh it in Mini Apps.` : (res.content || "Working on it…");
      await supabase.from("messages").update({ content: cleanMsg, activities: res.activities, attachments: done ? [{ type: "mini_app", id: done.id, name: done.name }] : [], status: "complete" }).eq("id", mid);
    }
  } catch (e: any) {
    if (mid) await supabase.from("messages").update({ content: `⚠️ Couldn't finish the update: ${e.message}`, status: "error" }).eq("id", mid);
  }

  await supabase.from("messages").insert({
    workspace_id: workspaceId, thread_id: opts.threadId ?? null, channel_id: opts.channelId ?? null,
    sender_type: "agent", agent_id: supervisor.id, status: "complete",
    content: done ? `✅ Updated **${done.name}** — open it in **Mini Apps** to see the changes.` : `We hit a snag updating it — check #${channelName}.`,
    attachments: done ? [{ type: "mini_app", id: done.id, name: done.name }] : [],
  });
  return true;
}

// Total agent turns allowed per user message (bounds back-and-forth between
// agents so a conversation can flow A→B→A→… without running away or burning
// through rate limits).
const MAX_AGENT_TURNS = 6;

/** User sent an image and asked to use it as a badge / profile picture. */
function isApplyImageIntent(content: string): boolean {
  const c = content.toLowerCase();
  return /\b(badge|icon|logo|avatar|profile|pfp|picture|photo|image)\b/.test(c) &&
    /\b(use|set|make|apply|change|update|put|this|that|as)\b/.test(c);
}

/** Apply an attached image as a rank badge / agent avatar / workspace picture. */
async function tryApplyImageFromChat(opts: DispatchOpts): Promise<boolean> {
  const { supabase, workspaceId } = opts;
  const text = opts.userContent.toLowerCase();
  if (!isApplyImageIntent(text)) return false;

  // Most recent image the user attached in this conversation.
  let q = supabase.from("messages").select("attachments").eq("sender_type", "user").order("created_at", { ascending: false }).limit(3);
  if (opts.threadId) q = q.eq("thread_id", opts.threadId);
  else if (opts.channelId) q = q.eq("channel_id", opts.channelId);
  const { data } = await q;
  let imageUrl = "";
  for (const m of (data as any[]) || []) {
    const img = (m.attachments || []).find((a: any) => a?.type === "image" && a.url);
    if (img) { imageUrl = img.url; break; }
  }
  if (!imageUrl) return false;

  const supervisor = opts.agents.find((a) => a.is_supervisor) || opts.agents[0];
  const say = (content: string) =>
    supabase.from("messages").insert({
      workspace_id: workspaceId,
      thread_id: opts.threadId ?? null,
      channel_id: opts.channelId ?? null,
      sender_type: "agent",
      agent_id: supervisor?.id,
      content,
      status: "complete",
    });

  const wantsBadge = /\b(badge|icon|logo)\b/.test(text);

  // Workspace picture.
  if (/\bworkspace\b/.test(text)) {
    await supabase.from("workspaces").update({ avatar_url: imageUrl }).eq("id", workspaceId);
    await say("Done — updated the workspace picture. 🎉");
    return true;
  }

  // A named rank → its badge image.
  const { data: ranks } = await supabase.from("ranks").select("id,name").eq("workspace_id", workspaceId);
  const rank = ((ranks as any[]) || []).find((r) => text.includes(r.name.toLowerCase()));
  if (rank && wantsBadge) {
    await supabase.from("ranks").update({ badge_url: imageUrl }).eq("id", rank.id);
    await say(`Done — set that image as the **${rank.name}** rank badge. ✅`);
    return true;
  }

  // A named agent → badge image or profile picture.
  const agent = opts.agents.find((a) => text.includes(a.name.toLowerCase()) || (a.handle && text.includes(a.handle.toLowerCase())));
  if (agent) {
    if (wantsBadge) {
      await supabase.from("agents").update({ badge_url: imageUrl }).eq("id", agent.id);
      await say(`Done — gave **${agent.name}** that badge. ✅`);
    } else {
      await supabase.from("agents").update({ avatar_url: imageUrl }).eq("id", agent.id);
      await say(`Done — updated **${agent.name}**'s profile picture. ✅`);
    }
    return true;
  }

  // Only one rank in the workspace + a badge request → apply to it.
  if (wantsBadge && (ranks as any[])?.length === 1) {
    await supabase.from("ranks").update({ badge_url: imageUrl }).eq("id", (ranks as any[])[0].id);
    await say(`Done — set that as the **${(ranks as any[])[0].name}** badge. ✅`);
    return true;
  }

  await say("I've got the image! Which one should I apply it to — a rank badge (tell me the rank name), a specific agent's picture, or the workspace photo?");
  return true;
}


/** Run the selected agent(s) for a freshly-posted user message. Awaits completion. */
export async function dispatch(opts: DispatchOpts): Promise<void> {
  const { supabase, workspaceId } = opts;
  const connectors = await getConnectors(supabase, workspaceId);

  // "Use this image as the badge / picture for X" → apply it directly.
  if (await tryApplyImageFromChat(opts)) return;

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

  // Follow-up "fix / expand / update the website" → update the existing app in
  // its channel (don't just reply in chat). Falls through if nothing's been built.
  if (isEditAppIntent(opts.userContent) && !isBuildAppIntent(opts.userContent) && hasGroqKey()) {
    if (await runUpdateFlow(opts2, connectors)) return;
  }

  // Build-a-website/app request → ALWAYS run the full build flow: AskAI researches
  // → writes a brief → opens a dedicated channel → briefs the Coder there → Coder
  // publishes to Mini Apps → AskAI reports back. (Mentioning "code agent" or AskAI
  // no longer short-circuits this into pasting code in the chat.)
  if (isBuildAppIntent(opts.userContent) && hasGroqKey()) {
    await runBuildFlow(opts2, connectors);
    return;
  }

  // "Get every agent to ..." → every agent responds (each on its own).
  const broadcast = isAllAgentsIntent(opts.userContent);
  const selected = broadcast
    ? agentsList.filter((a) => a.status !== "archived")
    : selectAgents(opts.userContent, agentsList, opts.primaryAgentId, preferSpecialistId);
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

  // Broadcasts give each agent its own turn; normal chats use the smaller budget
  // (which still allows agent-to-agent back-and-forth).
  const budget = { left: broadcast ? responders.length + 1 : MAX_AGENT_TURNS };
  for (const agent of responders) {
    if (budget.left <= 0) break;
    await runOneAgent(opts2, connectors, agent, opts.userContent, budget);
  }
}

async function runOneAgent(
  opts: DispatchOpts,
  connectors: Record<string, string>,
  agent: Agent,
  triggerText: string,
  budget: { left: number }
): Promise<void> {
  const { supabase, workspaceId } = opts;
  if (budget.left <= 0) return;
  budget.left--;

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
    const history = await buildHistory(supabase, { threadId: opts.threadId, channelId: opts.channelId }, agent.id, opts.agents, opts.userName ?? undefined);
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

    // Only remember things that actually matter (durable facts / preferences /
    // explicit "remember this") — not every passing message. Keeps memory small
    // and useful instead of a transcript dump.
    if (agent.memory_enabled) {
      const fact = extractMemorable(triggerText);
      if (fact) {
        const { data: dupe } = await supabase
          .from("agent_memories")
          .select("id")
          .eq("workspace_id", workspaceId)
          .eq("content", fact)
          .limit(1);
        if (!dupe || !dupe.length) {
          await supabase.from("agent_memories").insert({ workspace_id: workspaceId, agent_id: agent.id, kind: "fact", content: fact });
        }
      }
    }

    // Conversation hand-off: if this agent addressed exactly ONE teammate — by
    // @mention OR by name at the start ("Ilma, listen up…") — that teammate
    // reads this message and replies next, in their OWN words. Bounded by budget.
    if (budget.left > 0) {
      const next = handoffTarget(result.content, opts.agents, agent.id);
      if (next) {
        await runOneAgent(opts, connectors, next, `[${agent.name}]: ${result.content}`, budget);
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
