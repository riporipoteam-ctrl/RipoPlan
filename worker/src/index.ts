/**
 * AgentNexus backend — single Cloudflare Worker for the static GitHub Pages app.
 *
 *  /v1/chat/completions  OpenAI-compatible chat. Routes by model name:
 *                          "glm-5.2" / "@cf/..." -> Workers AI (Cloudflare GPUs)
 *                          "vendor/model"        -> NVIDIA (build.nvidia.com)
 *  /llm                  same, but provider chosen by body.provider
 *  /image/generate,/edit  NVIDIA FLUX image gen
 *  /browse               live browser: real headless Chrome (Browser Rendering)
 *                          when the BROWSER binding exists, else server fetch
 *  /gmail                Gmail API proxy (token from OAuth)
 *  /tasks/run + cron     run queued background_tasks so agents keep working
 *                          after the app is closed
 *  /oauth/:p/start,/callback  Google sign-in (Gmail)
 *
 * Bindings: AI (Workers AI — runs GLM-5.2)
 * Secrets:  NVIDIA_API_KEY, GROQ_API_KEY, GOOGLE_CLIENT_ID,
 *           GOOGLE_CLIENT_SECRET, SUPABASE_SERVICE_KEY
 * Vars:     ALLOWED_ORIGIN, APP_REDIRECT, SUPABASE_URL, AGENT_MODEL
 */

interface Env {
  AI: any; // Workers AI binding (runs GLM-5.2 on Cloudflare's GPUs)
  ALLOWED_ORIGIN: string;
  APP_REDIRECT: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_KEY?: string;
  AGENT_MODEL?: string;
  GROQ_API_KEY?: string;
  NVIDIA_API_KEY?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  BROWSER?: any; // Browser Rendering binding (optional, Workers Paid)
}

// Default chat model: GLM-5.2 on Workers AI.
const CF_GLM = "@cf/zai-org/glm-5.2";

const NVIDIA_CHAT = "https://integrate.api.nvidia.com/v1/chat/completions";
const GENAI = "https://ai.api.nvidia.com/v1/genai";
const IMAGE_MODEL = "black-forest-labs/flux.2-klein-4b";
const FALLBACK_IMAGE_MODEL = "black-forest-labs/flux.1-dev";

const GOOGLE_SCOPES: Record<string, string> = {
  gmail: "https://www.googleapis.com/auth/gmail.modify",
  google_calendar: "https://www.googleapis.com/auth/calendar",
  google_drive: "https://www.googleapis.com/auth/drive",
  sheets: "https://www.googleapis.com/auth/spreadsheets",
};

function cors(env: Env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "authorization,content-type",
  };
}

// --------------------------- chat routing ---------------------------
// Resolve a requested model name to a concrete provider+id.
//   "glm-5.2" / "@cf/..."  -> Workers AI (Cloudflare GPUs)
//   "vendor/model"          -> NVIDIA
function resolveModel(env: Env, model?: string): { provider: "cf" | "nvidia"; id: string } {
  const m = model || env.AGENT_MODEL || CF_GLM;
  if (m.startsWith("@cf/")) return { provider: "cf", id: m };
  if (/^glm/i.test(m)) return { provider: "cf", id: CF_GLM };
  if (m.includes("/")) return { provider: "nvidia", id: m };
  return { provider: "cf", id: CF_GLM };
}

/** Run a chat completion on Workers AI and normalize to OpenAI shape. */
async function workersAIChat(env: Env, id: string, body: any): Promise<any> {
  const out: any = await env.AI.run(id, {
    messages: body.messages,
    max_tokens: body.max_tokens || body.max_completion_tokens || 2048,
    temperature: body.temperature ?? 0.6,
    ...(body.tools ? { tools: body.tools } : {}),
  });
  if (out?.choices) return out; // already OpenAI-shaped
  const tool_calls = (out?.tool_calls || []).map((t: any, i: number) => ({
    id: t.id || `call_${i}_${Date.now()}`,
    type: "function",
    function: { name: t.name || t.function?.name, arguments: typeof t.arguments === "string" ? t.arguments : JSON.stringify(t.arguments || t.function?.arguments || {}) },
  }));
  return {
    choices: [{ index: 0, message: { role: "assistant", content: out?.response ?? out?.result ?? "", ...(tool_calls.length ? { tool_calls } : {}) }, finish_reason: tool_calls.length ? "tool_calls" : "stop" }],
    usage: out?.usage || {},
  };
}

async function chatCompletion(env: Env, body: any): Promise<Response> {
  const r = resolveModel(env, body.model);
  try {
    if (r.provider === "cf") {
      const data = await workersAIChat(env, r.id, body);
      return Response.json(data, { headers: cors(env) });
    }
    if (!env.NVIDIA_API_KEY) return Response.json({ error: "NVIDIA_API_KEY not set" }, { status: 400, headers: cors(env) });
    const up = await fetch(NVIDIA_CHAT, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.NVIDIA_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, model: r.id }),
    });
    return new Response(up.body, { status: up.status, headers: { ...cors(env), "Content-Type": "application/json" } });
  } catch (e: any) {
    return Response.json({ error: String(e.message || e) }, { status: 502, headers: cors(env) });
  }
}

// ----------------------------- Supabase REST -----------------------------
function sb(env: Env) {
  const base = (env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = env.SUPABASE_SERVICE_KEY || "";
  const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  return {
    ok: !!base && !!key,
    async get(path: string) { const r = await fetch(`${base}/rest/v1/${path}`, { headers }); return r.ok ? r.json() : []; },
    async patch(path: string, b: any) { await fetch(`${base}/rest/v1/${path}`, { method: "PATCH", headers, body: JSON.stringify(b) }); },
    async insert(table: string, b: any) {
      const r = await fetch(`${base}/rest/v1/${table}`, { method: "POST", headers: { ...headers, Prefer: "return=representation" }, body: JSON.stringify(b) });
      const d = await r.json().catch(() => []); return Array.isArray(d) ? d[0] : d;
    },
  };
}

// ----------------------------- live browser -----------------------------
async function serverFetch(url: string): Promise<string> {
  const target = url.startsWith("http") ? url : `https://${url}`;
  try {
    const r = await fetch(`https://r.jina.ai/${target}`, { headers: { "X-Return-Format": "markdown" } });
    if (r.ok) { const t = await r.text(); if (t.length > 80) return t.slice(0, 6000); }
  } catch {}
  try {
    const r = await fetch(target, { headers: { "User-Agent": "Mozilla/5.0 AgentNexusBot" } });
    let html = await r.text();
    html = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return html.slice(0, 6000);
  } catch (e: any) { return `Failed to fetch ${url}: ${e.message}`; }
}

async function liveBrowse(env: Env, url: string): Promise<string> {
  // The live browser. r.jina.ai renders the page server-side (executes the page
  // and returns readable content), so agents see real, rendered pages — not just
  // raw HTML. For full interactive headless Chrome, enable the Browser Rendering
  // binding (see wrangler.toml) and swap this for @cloudflare/puppeteer.
  return serverFetch(url);
}

async function serverSearch(query: string): Promise<string> {
  try {
    const r = await fetch(`https://r.jina.ai/https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, { headers: { "X-Return-Format": "markdown" } });
    if (r.ok) {
      let md = await r.text();
      md = md.replace(/https?:\/\/(?:html\.)?duckduckgo\.com\/l\/\?uddg=([^)&\s]+)[^)\s]*/g, (_m, u) => { try { return decodeURIComponent(u); } catch { return _m; } });
      return md.slice(0, 5000);
    }
  } catch {}
  return serverFetch(`https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(query)}`);
}

// ----------------------------- server agent loop -----------------------------
const SERVER_TOOLS = [
  { type: "function", function: { name: "web_search", description: "Search the live web.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } } },
  { type: "function", function: { name: "browse", description: "Open and read a web page.", parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"] } } },
];

async function agentChat(env: Env, messages: any[], tools?: any[]): Promise<any> {
  const body: any = { model: env.AGENT_MODEL || "glm-5.2", messages, max_tokens: 2048, temperature: 0.6, stream: false };
  if (tools) { body.tools = tools; body.tool_choice = "auto"; }
  const res = await chatCompletion(env, body);
  if (!res.ok) throw new Error(`chat ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

function clean(t: string): string {
  return (t || "").replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/<\/?[A-Z][\w-]{1,30}>/g, "").trim();
}

async function runServerAgent(env: Env, system: string, history: any[]): Promise<string> {
  const messages: any[] = [{ role: "system", content: system }, ...history];
  for (let round = 0; round < 3; round++) {
    const res = await agentChat(env, messages, round < 2 ? SERVER_TOOLS : undefined);
    const msg = res.choices?.[0]?.message;
    if (!msg) break;
    const calls = msg.tool_calls || [];
    if (!calls.length) return clean(msg.content || "") || "Done.";
    messages.push({ role: "assistant", content: msg.content || "", tool_calls: calls });
    for (const c of calls) {
      let args: any = {}; try { args = JSON.parse(c.function.arguments || "{}"); } catch {}
      const out = c.function.name === "web_search" ? await serverSearch(String(args.query || "")) : await liveBrowse(env, String(args.url || ""));
      messages.push({ role: "tool", tool_call_id: c.id, name: c.function.name, content: out.slice(0, 6000) });
    }
  }
  const fin = await agentChat(env, [...messages, { role: "user", content: "Give your final answer now." }]);
  return clean(fin.choices?.[0]?.message?.content || "") || "Done.";
}

async function processTasks(env: Env, limit = 5): Promise<number> {
  const db = sb(env);
  if (!db.ok) return 0;
  const tasks = await db.get(`background_tasks?status=eq.pending&order=created_at.asc&limit=${limit}`);
  let done = 0;
  for (const t of tasks as any[]) {
    await db.patch(`background_tasks?id=eq.${t.id}`, { status: "running", attempts: (t.attempts || 0) + 1, updated_at: new Date().toISOString() });
    try {
      const agentRows = t.agent_id ? await db.get(`agents?id=eq.${t.agent_id}`) : [];
      const agent = (agentRows as any[])[0] || { name: "Agent", system_prompt: "You are a helpful AI agent." };
      const filter = t.thread_id ? `thread_id=eq.${t.thread_id}` : t.channel_id ? `channel_id=eq.${t.channel_id}` : `workspace_id=eq.${t.workspace_id}`;
      const msgs = await db.get(`messages?${filter}&order=created_at.asc&limit=20&select=sender_type,content`);
      const history = ((msgs as any[]) || []).filter((m) => m.content).map((m) => ({ role: m.sender_type === "user" ? "user" : "assistant", content: m.content }));
      history.push({ role: "user", content: t.prompt });
      const system = `${agent.system_prompt || `You are ${agent.name}.`}\nYou are completing a task in the background (the user may be away). Be thorough and finish the job. Answer in clear Markdown. Speak only as yourself.`;
      const reply = await runServerAgent(env, system, history);
      if (t.message_id) await db.patch(`messages?id=eq.${t.message_id}`, { content: reply, status: "complete", activities: [] });
      else await db.insert("messages", { workspace_id: t.workspace_id, thread_id: t.thread_id, channel_id: t.channel_id, sender_type: "agent", agent_id: t.agent_id, content: reply, status: "complete" });
      await db.patch(`background_tasks?id=eq.${t.id}`, { status: "done", result: reply.slice(0, 4000), updated_at: new Date().toISOString() });
      done++;
    } catch (e: any) {
      const failed = (t.attempts || 0) + 1 >= 3;
      if (t.message_id && failed) await db.patch(`messages?id=eq.${t.message_id}`, { content: `⚠️ Background task failed: ${e.message}`, status: "error" });
      await db.patch(`background_tasks?id=eq.${t.id}`, { status: failed ? "error" : "pending", result: String(e.message).slice(0, 500), updated_at: new Date().toISOString() });
    }
  }
  return done;
}

// ----------------------------- images (NVIDIA FLUX) -----------------------------
function normDim(v: any, fb: number) { const allowed = [768, 832, 896, 960, 1024, 1088, 1152]; const n = Number(v); return allowed.includes(n) ? n : fb; }
function hardenPrompt(p: string) { return `${String(p || "").replace(/\s+/g, " ").trim()}, well-lit, high contrast, complete visible subject, no black canvas`.slice(0, 1200); }
function extractB64(d: any): string { const i = d?.artifacts?.[0]?.base64 || d?.data?.[0]?.b64_json || d?.image || d?.b64_json || (Array.isArray(d?.images) ? d.images[0] : ""); return typeof i === "string" ? i.replace(/^data:image\/\w+;base64,/, "") : ""; }
function blank(b64: string, w: number, h: number) { return !b64 || b64.length < Math.max(10000, Math.round(w * h * 0.018)); }

async function genImage(env: Env, input: any): Promise<Response> {
  const key = env.NVIDIA_API_KEY;
  if (!key) return Response.json({ error: "NVIDIA_API_KEY not set" }, { status: 400, headers: cors(env) });
  const auth = { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" };
  const w = normDim(input.width, 1024), h = normDim(input.height, 1024);
  const seed = Number.isFinite(Number(input.seed)) ? Number(input.seed) : Math.floor(Math.random() * 1e6);
  const prompt = hardenPrompt(input.prompt);
  for (const model of [IMAGE_MODEL, FALLBACK_IMAGE_MODEL]) {
    const payload = model === IMAGE_MODEL
      ? { prompt, width: w, height: h, seed, steps: 4 }
      : { prompt, mode: "base", width: w, height: h, steps: 40, cfg_scale: 4.5, samples: 1, seed };
    try {
      const r = await fetch(`${GENAI}/${model}`, { method: "POST", headers: auth, body: JSON.stringify(payload) });
      if (!r.ok) continue;
      const d = await r.json();
      const b64 = extractB64(d);
      if (!blank(b64, w, h)) return Response.json({ provider: "nvidia", model, width: w, height: h, seed, image: "data:image/jpeg;base64," + b64, base64: b64 }, { headers: cors(env) });
    } catch {}
  }
  return Response.json({ error: "Image generation failed." }, { status: 502, headers: cors(env) });
}

// ----------------------------- worker -----------------------------
export default {
  async scheduled(_e: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(processTasks(env, 5));
  },

  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { headers: cors(env) });

    if (url.pathname === "/health") {
      return Response.json({ ok: true, model: env.AGENT_MODEL || CF_GLM, workersAI: !!env.AI, nvidia: !!env.NVIDIA_API_KEY, google: !!env.GOOGLE_CLIENT_ID, supabase: !!env.SUPABASE_SERVICE_KEY, browser: !!env.BROWSER }, { headers: cors(env) });
    }

    if ((url.pathname === "/v1/chat/completions" || url.pathname === "/chat") && req.method === "POST") {
      return chatCompletion(env, await req.json<any>());
    }

    if (url.pathname === "/llm" && req.method === "POST") {
      const body = await req.json<any>();
      const provider = body.provider; delete body.provider;
      if (provider === "groq") {
        if (!env.GROQ_API_KEY) return Response.json({ error: "groq key not set" }, { status: 400, headers: cors(env) });
        const r = await fetch("https://api.groq.com/openai/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${env.GROQ_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
        return new Response(r.body, { status: r.status, headers: { ...cors(env), "Content-Type": "application/json" } });
      }
      return chatCompletion(env, body);
    }

    if ((url.pathname === "/image/generate" || url.pathname === "/image/edit") && req.method === "POST") {
      return genImage(env, await req.json<any>());
    }

    if (url.pathname === "/tasks/run" && req.method === "POST") {
      ctx.waitUntil(processTasks(env, 5));
      return Response.json({ ok: true }, { headers: cors(env) });
    }

    if (url.pathname === "/browse" && req.method === "POST") {
      const { url: u, query } = await req.json<any>();
      const out = query ? await serverSearch(String(query)) : await liveBrowse(env, String(u || ""));
      return Response.json({ ok: true, content: out }, { headers: cors(env) });
    }

    if (url.pathname === "/gmail" && req.method === "POST") {
      const { token, action, id, q } = await req.json<any>();
      if (!token) return Response.json({ error: "missing token" }, { status: 400, headers: cors(env) });
      const a = { Authorization: `Bearer ${token}` };
      if (action === "read" && id) {
        const m = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`, { headers: a }).then((r) => r.json());
        return Response.json({ ok: true, message: m }, { headers: cors(env) });
      }
      const list = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10${q ? `&q=${encodeURIComponent(q)}` : ""}`, { headers: a }).then((r) => r.json<any>());
      const ids = (list.messages || []).slice(0, 8).map((x: any) => x.id);
      const items = await Promise.all(ids.map(async (mid: string) => {
        const m = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${mid}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`, { headers: a }).then((r) => r.json<any>());
        const h = (m.payload?.headers || []).reduce((o: any, x: any) => ((o[x.name] = x.value), o), {});
        return { id: mid, subject: h.Subject || "(no subject)", from: h.From || "", date: h.Date || "", snippet: m.snippet || "" };
      }));
      return Response.json({ ok: true, items }, { headers: cors(env) });
    }

    const startMatch = url.pathname.match(/^\/oauth\/([\w-]+)\/start$/);
    if (startMatch) {
      const provider = startMatch[1];
      const scope = GOOGLE_SCOPES[provider];
      if (!scope || !env.GOOGLE_CLIENT_ID) return Response.json({ error: "provider not configured" }, { status: 400, headers: cors(env) });
      const redirectUri = `${url.origin}/oauth/${provider}/callback`;
      const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      auth.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
      auth.searchParams.set("redirect_uri", redirectUri);
      auth.searchParams.set("response_type", "code");
      auth.searchParams.set("access_type", "offline");
      auth.searchParams.set("prompt", "consent");
      auth.searchParams.set("scope", scope);
      auth.searchParams.set("state", provider);
      return Response.redirect(auth.toString(), 302);
    }

    const cbMatch = url.pathname.match(/^\/oauth\/([\w-]+)\/callback$/);
    if (cbMatch) {
      const provider = cbMatch[1];
      const code = url.searchParams.get("code");
      const redirectUri = `${url.origin}/oauth/${provider}/callback`;
      const tok = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ code: code || "", client_id: env.GOOGLE_CLIENT_ID || "", client_secret: env.GOOGLE_CLIENT_SECRET || "", redirect_uri: redirectUri, grant_type: "authorization_code" }),
      }).then((r) => r.json<any>());
      const html = `<!doctype html><script>
        try { window.opener && window.opener.postMessage({ type: "agentnexus-oauth", provider: ${JSON.stringify(provider)}, token: ${JSON.stringify(tok.access_token || "")}, refresh: ${JSON.stringify(tok.refresh_token || "")} }, "*"); } catch(e){}
        window.close();</script>Connected. You can close this window.`;
      return new Response(html, { headers: { "Content-Type": "text/html" } });
    }

    return new Response("AgentNexus backend", { headers: cors(env) });
  },
};
