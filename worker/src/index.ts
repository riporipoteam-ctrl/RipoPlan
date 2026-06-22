/**
 * AgentNexus backend — Cloudflare Worker.
 *
 * Gives the static GitHub Pages app the things it can't do itself:
 *   1. /llm           — proxy NVIDIA / Groq with the key server-side.
 *   2. /oauth/*       — real "Sign in with Google" (Gmail) token exchange.
 *   3. /gmail         — proxy the Gmail API with a stored token.
 *   4. /browse        — server-side fetch + extract (no CORS), the "live browser".
 *   5. cron + /tasks/run — run queued background_tasks so AGENTS KEEP WORKING
 *                          after the user closes the app. Uses the Supabase
 *                          service role to read history and post replies.
 *
 * Secrets (wrangler secret put / set in the deploy workflow):
 *   NVIDIA_API_KEY, GROQ_API_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
 *   SUPABASE_SERVICE_KEY
 * Vars (wrangler.toml): ALLOWED_ORIGIN, APP_REDIRECT, SUPABASE_URL, AGENT_MODEL
 */

interface Env {
  ALLOWED_ORIGIN: string;
  APP_REDIRECT: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_KEY?: string;
  AGENT_MODEL?: string;
  GROQ_API_KEY?: string;
  NVIDIA_API_KEY?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
}

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

// ----------------------------- Supabase REST -----------------------------
function sb(env: Env) {
  const base = (env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = env.SUPABASE_SERVICE_KEY || "";
  const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  return {
    ok: !!base && !!key,
    async get(path: string) {
      const r = await fetch(`${base}/rest/v1/${path}`, { headers });
      return r.ok ? r.json() : [];
    },
    async patch(path: string, body: any) {
      await fetch(`${base}/rest/v1/${path}`, { method: "PATCH", headers, body: JSON.stringify(body) });
    },
    async insert(table: string, body: any) {
      const r = await fetch(`${base}/rest/v1/${table}`, {
        method: "POST",
        headers: { ...headers, Prefer: "return=representation" },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => []);
      return Array.isArray(d) ? d[0] : d;
    },
  };
}

// ----------------------------- Server tools -----------------------------
async function serverBrowse(url: string): Promise<string> {
  const target = url.startsWith("http") ? url : `https://${url}`;
  try {
    const r = await fetch(`https://r.jina.ai/${target}`, { headers: { "X-Return-Format": "markdown" } });
    if (r.ok) {
      const t = await r.text();
      if (t.length > 80) return t.slice(0, 6000);
    }
  } catch {}
  try {
    const r = await fetch(target, { headers: { "User-Agent": "Mozilla/5.0 AgentNexusBot" } });
    let html = await r.text();
    html = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return html.slice(0, 6000);
  } catch (e: any) {
    return `Failed to fetch ${url}: ${e.message}`;
  }
}

async function serverSearch(query: string): Promise<string> {
  try {
    const r = await fetch(`https://r.jina.ai/https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: { "X-Return-Format": "markdown" },
    });
    if (r.ok) {
      let md = await r.text();
      md = md.replace(/https?:\/\/(?:html\.)?duckduckgo\.com\/l\/\?uddg=([^)&\s]+)[^)\s]*/g, (_m, u) => {
        try { return decodeURIComponent(u); } catch { return _m; }
      });
      return md.slice(0, 5000);
    }
  } catch {}
  return await serverBrowse(`https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(query)}`);
}

const SERVER_TOOLS = [
  { type: "function", function: { name: "web_search", description: "Search the live web.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } } },
  { type: "function", function: { name: "browse", description: "Fetch and read a web page.", parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"] } } },
];

async function nvidiaChat(env: Env, messages: any[], tools?: any[]) {
  const model = env.AGENT_MODEL || "meta/llama-3.1-405b-instruct";
  const r = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.NVIDIA_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, max_tokens: 2048, temperature: 0.6, stream: false, ...(tools ? { tools, tool_choice: "auto" } : {}) }),
  });
  if (!r.ok) throw new Error(`NVIDIA ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json<any>();
}

function sanitize(t: string): string {
  return (t || "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<\/?[A-Z][\w-]{1,30}>/g, "")
    .trim();
}

/** Minimal server-side agent loop (NVIDIA + web_search/browse). */
async function runServerAgent(env: Env, system: string, history: any[]): Promise<string> {
  const messages: any[] = [{ role: "system", content: system }, ...history];
  for (let round = 0; round < 3; round++) {
    const useTools = round < 2;
    const res = await nvidiaChat(env, messages, useTools ? SERVER_TOOLS : undefined);
    const msg = res.choices?.[0]?.message;
    if (!msg) break;
    const calls = msg.tool_calls || [];
    if (!calls.length) return sanitize(msg.content || "") || "Done.";
    messages.push({ role: "assistant", content: msg.content || "", tool_calls: calls });
    for (const c of calls) {
      let args: any = {};
      try { args = JSON.parse(c.function.arguments || "{}"); } catch {}
      let out = "";
      if (c.function.name === "web_search") out = await serverSearch(String(args.query || ""));
      else if (c.function.name === "browse") out = await serverBrowse(String(args.url || ""));
      else out = "Unknown tool.";
      messages.push({ role: "tool", tool_call_id: c.id, name: c.function.name, content: out.slice(0, 6000) });
    }
  }
  const fin = await nvidiaChat(env, [...messages, { role: "user", content: "Give your final answer now." }]);
  return sanitize(fin.choices?.[0]?.message?.content || "") || "Done.";
}

/** Process a few queued background tasks: run the agent and post the reply. */
async function processTasks(env: Env, limit = 3): Promise<number> {
  const db = sb(env);
  if (!db.ok || !env.NVIDIA_API_KEY) return 0;
  const tasks = await db.get(`background_tasks?status=eq.pending&order=created_at.asc&limit=${limit}`);
  let done = 0;
  for (const t of tasks as any[]) {
    await db.patch(`background_tasks?id=eq.${t.id}`, { status: "running", attempts: (t.attempts || 0) + 1, updated_at: new Date().toISOString() });
    try {
      const agentRows = t.agent_id ? await db.get(`agents?id=eq.${t.agent_id}`) : [];
      const agent = (agentRows as any[])[0] || { name: "Agent", system_prompt: "You are a helpful AI agent." };
      // Recent history for context.
      const filter = t.thread_id ? `thread_id=eq.${t.thread_id}` : t.channel_id ? `channel_id=eq.${t.channel_id}` : `workspace_id=eq.${t.workspace_id}`;
      const msgs = await db.get(`messages?${filter}&order=created_at.asc&limit=20&select=sender_type,content`);
      const history = ((msgs as any[]) || [])
        .filter((m) => m.content)
        .map((m) => ({ role: m.sender_type === "user" ? "user" : "assistant", content: m.content }));
      history.push({ role: "user", content: t.prompt });
      const system = `${agent.system_prompt || `You are ${agent.name}.`}\nYou are completing a task in the background (the user may be away). Be thorough and finish the job. Answer in clear Markdown. Speak only as yourself.`;
      const reply = await runServerAgent(env, system, history);
      // Update the placeholder message if one exists, else insert.
      if (t.message_id) {
        await db.patch(`messages?id=eq.${t.message_id}`, { content: reply, status: "complete" });
      } else {
        await db.insert("messages", {
          workspace_id: t.workspace_id, thread_id: t.thread_id, channel_id: t.channel_id,
          sender_type: "agent", agent_id: t.agent_id, content: reply, status: "complete",
        });
      }
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

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(processTasks(env, 5));
  },

  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { headers: cors(env) });

    if (url.pathname === "/health") {
      return Response.json(
        { ok: true, nvidia: !!env.NVIDIA_API_KEY, groq: !!env.GROQ_API_KEY, google: !!env.GOOGLE_CLIENT_ID, supabase: !!env.SUPABASE_SERVICE_KEY },
        { headers: cors(env) }
      );
    }

    // Kick the task queue on demand (the app calls this right after enqueuing).
    if (url.pathname === "/tasks/run" && req.method === "POST") {
      ctx.waitUntil(processTasks(env, 5));
      return Response.json({ ok: true }, { headers: cors(env) });
    }

    // Server-side browser/search (no CORS, runs even with the app closed).
    if (url.pathname === "/browse" && req.method === "POST") {
      const { url: u, query } = await req.json<any>();
      const out = query ? await serverSearch(String(query)) : await serverBrowse(String(u || ""));
      return Response.json({ ok: true, content: out }, { headers: cors(env) });
    }

    // Gmail proxy: POST /gmail { token, action: "list"|"read", id?, q? }
    if (url.pathname === "/gmail" && req.method === "POST") {
      const { token, action, id, q } = await req.json<any>();
      if (!token) return Response.json({ error: "missing token" }, { status: 400, headers: cors(env) });
      const auth = { Authorization: `Bearer ${token}` };
      if (action === "read" && id) {
        const m = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`, { headers: auth }).then((r) => r.json());
        return Response.json({ ok: true, message: m }, { headers: cors(env) });
      }
      const list = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10${q ? `&q=${encodeURIComponent(q)}` : ""}`, { headers: auth }).then((r) => r.json<any>());
      const ids = (list.messages || []).slice(0, 8).map((x: any) => x.id);
      const items = await Promise.all(
        ids.map(async (mid: string) => {
          const m = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${mid}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`, { headers: auth }).then((r) => r.json<any>());
          const h = (m.payload?.headers || []).reduce((a: any, x: any) => ((a[x.name] = x.value), a), {});
          return { id: mid, subject: h.Subject || "(no subject)", from: h.From || "", date: h.Date || "", snippet: m.snippet || "" };
        })
      );
      return Response.json({ ok: true, items }, { headers: cors(env) });
    }

    // LLM proxy.
    if (url.pathname === "/llm" && req.method === "POST") {
      const body = await req.json<any>();
      const provider = body.provider || "nvidia";
      delete body.provider;
      const upstream = provider === "groq" ? "https://api.groq.com/openai/v1/chat/completions" : "https://integrate.api.nvidia.com/v1/chat/completions";
      const key = provider === "groq" ? env.GROQ_API_KEY : env.NVIDIA_API_KEY;
      if (!key) return Response.json({ error: `${provider} key not configured` }, { status: 400, headers: cors(env) });
      const r = await fetch(upstream, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
      return new Response(r.body, { status: r.status, headers: { ...cors(env), "Content-Type": "application/json" } });
    }

    // OAuth start.
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

    // OAuth callback.
    const cbMatch = url.pathname.match(/^\/oauth\/([\w-]+)\/callback$/);
    if (cbMatch) {
      const provider = cbMatch[1];
      const code = url.searchParams.get("code");
      const redirectUri = `${url.origin}/oauth/${provider}/callback`;
      const tok = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code: code || "",
          client_id: env.GOOGLE_CLIENT_ID || "",
          client_secret: env.GOOGLE_CLIENT_SECRET || "",
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      }).then((r) => r.json<any>());
      const html = `<!doctype html><script>
        try { window.opener && window.opener.postMessage(
          { type: "agentnexus-oauth", provider: ${JSON.stringify(provider)}, token: ${JSON.stringify(tok.access_token || "")}, refresh: ${JSON.stringify(tok.refresh_token || "")} }, "*"); } catch(e){}
        window.close();
      </script>Connected. You can close this window.`;
      return new Response(html, { headers: { "Content-Type": "text/html" } });
    }

    return new Response("AgentNexus backend", { headers: cors(env) });
  },
};
