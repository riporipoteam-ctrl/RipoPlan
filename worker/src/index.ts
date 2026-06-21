/**
 * AgentNexus backend — Cloudflare Worker.
 *
 * Gives the static GitHub Pages app the one thing it can't do itself: a tiny
 * server for (1) proxying LLM providers that need a hidden key / lack browser
 * CORS (NVIDIA build.nvidia.com, optionally Groq), and (2) OAuth token exchange
 * for real "Sign in with Google" connectors (Gmail / Calendar / Drive).
 *
 * Deploy:  cd worker && npm i -g wrangler && wrangler deploy
 * Secrets: wrangler secret put NVIDIA_API_KEY   (and GOOGLE_CLIENT_ID/SECRET, GROQ_API_KEY)
 */

interface Env {
  ALLOWED_ORIGIN: string;
  APP_REDIRECT: string;
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

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { headers: cors(env) });

    // ---- Health ----
    if (url.pathname === "/health") {
      return Response.json(
        { ok: true, nvidia: !!env.NVIDIA_API_KEY, groq: !!env.GROQ_API_KEY, google: !!env.GOOGLE_CLIENT_ID },
        { headers: cors(env) }
      );
    }

    // ---- LLM proxy: POST /llm  { provider: "nvidia"|"groq", ...openAIChatBody } ----
    if (url.pathname === "/llm" && req.method === "POST") {
      const body = await req.json<any>();
      const provider = body.provider || "nvidia";
      delete body.provider;
      const upstream =
        provider === "groq"
          ? "https://api.groq.com/openai/v1/chat/completions"
          : "https://integrate.api.nvidia.com/v1/chat/completions";
      const key = provider === "groq" ? env.GROQ_API_KEY : env.NVIDIA_API_KEY;
      if (!key) return Response.json({ error: `${provider} key not configured` }, { status: 400, headers: cors(env) });
      const r = await fetch(upstream, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return new Response(r.body, { status: r.status, headers: { ...cors(env), "Content-Type": "application/json" } });
    }

    // ---- OAuth start: GET /oauth/:provider/start ----
    const startMatch = url.pathname.match(/^\/oauth\/([\w-]+)\/start$/);
    if (startMatch) {
      const provider = startMatch[1];
      const scope = GOOGLE_SCOPES[provider];
      if (!scope || !env.GOOGLE_CLIENT_ID)
        return Response.json({ error: "provider not configured" }, { status: 400, headers: cors(env) });
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

    // ---- OAuth callback: exchanges code, posts token back to the app window ----
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
      // Hand the token back to the opener; the app stores it as an integration.
      const html = `<!doctype html><script>
        try { window.opener && window.opener.postMessage(
          { type: "agentnexus-oauth", provider: ${JSON.stringify(provider)}, token: ${JSON.stringify(
        tok.access_token || ""
      )}, refresh: ${JSON.stringify(tok.refresh_token || "")} }, "*"); } catch(e){}
        window.close();
      </script>Connected. You can close this window.`;
      return new Response(html, { headers: { "Content-Type": "text/html" } });
    }

    return new Response("AgentNexus backend", { headers: cors(env) });
  },
};
