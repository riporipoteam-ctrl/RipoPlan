export interface ToolResult {
  ok: boolean;
  output: string;
}

/** Tool JSON schemas exposed to the model (OpenAI/Groq tool-calling format). */
export const TOOL_SCHEMAS: Record<string, any> = {
  web_search: {
    type: "function",
    function: {
      name: "web_search",
      description:
        "Search the live web for current information (news, prices, facts, schedules). Returns top results with snippets and URLs.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "The search query" } },
        required: ["query"],
      },
    },
  },
  browse: {
    type: "function",
    function: {
      name: "browse",
      description: "Fetch a web page URL and return its readable text content.",
      parameters: {
        type: "object",
        properties: { url: { type: "string", description: "Absolute URL to fetch" } },
        required: ["url"],
      },
    },
  },
  code: {
    type: "function",
    function: {
      name: "code",
      description:
        "Execute JavaScript in a browser sandbox to compute results, transform data, or do math. Use console.log or return a value. No network or DOM access.",
      parameters: {
        type: "object",
        properties: { source: { type: "string", description: "JavaScript source to run" } },
        required: ["source"],
      },
    },
  },
  create_agent: {
    type: "function",
    function: {
      name: "create_agent",
      description:
        "Create a brand-new AI agent in this workspace and add it to the team. Use this whenever the user asks to make/add an agent.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Short proper name, e.g. 'Bob'" },
          role: { type: "string", description: "Short role title, e.g. 'Software Engineer'" },
          description: { type: "string", description: "One sentence on what it does" },
          tools: {
            type: "array",
            items: { type: "string", enum: ["web_search", "browse", "code"] },
            description: "Which tools the new agent should have",
          },
        },
        required: ["name", "role"],
      },
    },
  },
  delegate: {
    type: "function",
    function: {
      name: "delegate",
      description:
        "Delegate a task to one of the existing specialist agents by handle (e.g. 'writer', 'researcher', 'web-browser'). The agent will reply in this thread.",
      parameters: {
        type: "object",
        properties: {
          handle: { type: "string", description: "The agent handle to delegate to" },
          task: { type: "string", description: "Clear instructions for that agent" },
        },
        required: ["handle", "task"],
      },
    },
  },
};

export function schemasForTools(tools: string[]) {
  const names = new Set(tools);
  return Object.entries(TOOL_SCHEMAS)
    .filter(([k]) => names.has(k))
    .map(([, v]) => v);
}

// ---- Connector tools (enabled when the matching integration is connected) ----
export const CONNECTOR_TOOL_SCHEMAS: Record<string, any> = {
  github: {
    type: "function",
    function: {
      name: "github",
      description:
        "Act on the connected GitHub account. actions: 'list_repos' (recent repos), 'search_repos' (needs query), 'create_issue' (needs repo as 'owner/name', title, optional body).",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["list_repos", "search_repos", "create_issue"] },
          query: { type: "string" },
          repo: { type: "string", description: "owner/name" },
          title: { type: "string" },
          body: { type: "string" },
        },
        required: ["action"],
      },
    },
  },
  slack: {
    type: "function",
    function: {
      name: "slack",
      description: "Post a message to the connected Slack channel (via incoming webhook).",
      parameters: {
        type: "object",
        properties: { text: { type: "string", description: "Message to post" } },
        required: ["text"],
      },
    },
  },
};

/** Tool schemas for providers the workspace has connected. */
export function connectorSchemas(connectors: Record<string, string>) {
  return Object.keys(connectors)
    .filter((p) => CONNECTOR_TOOL_SCHEMAS[p])
    .map((p) => CONNECTOR_TOOL_SCHEMAS[p]);
}

async function githubTool(args: any, token: string): Promise<ToolResult> {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  try {
    if (args.action === "create_issue") {
      if (!args.repo || !args.title) return { ok: false, output: "repo and title are required" };
      const res = await fetch(`https://api.github.com/repos/${args.repo}/issues`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ title: args.title, body: args.body || "" }),
      });
      const d = await res.json();
      if (!res.ok) return { ok: false, output: `GitHub error: ${d.message || res.status}` };
      return { ok: true, output: `Created issue #${d.number}: ${d.html_url}` };
    }
    if (args.action === "search_repos") {
      const res = await fetch(`https://api.github.com/search/repositories?per_page=8&q=${encodeURIComponent(args.query || "")}`, { headers });
      const d = await res.json();
      const items = (d.items || []).map((r: any) => `- ${r.full_name} ⭐${r.stargazers_count}: ${r.description || ""}\n  ${r.html_url}`);
      return { ok: true, output: items.join("\n") || "No repositories found." };
    }
    // list_repos
    const res = await fetch("https://api.github.com/user/repos?per_page=20&sort=updated", { headers });
    const d = await res.json();
    if (!res.ok) return { ok: false, output: `GitHub error: ${d.message || res.status}` };
    const items = (d || []).map((r: any) => `- ${r.full_name}${r.private ? " (private)" : ""}: ${r.description || ""}`);
    return { ok: true, output: items.join("\n") || "No repositories." };
  } catch (e: any) {
    return { ok: false, output: `GitHub request failed: ${e.message}` };
  }
}

async function slackTool(args: any, webhook: string): Promise<ToolResult> {
  try {
    await fetch(webhook, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: String(args.text || "") }),
    });
    return { ok: true, output: "Posted to Slack." };
  } catch (e: any) {
    return { ok: false, output: `Slack post failed: ${e.message}` };
  }
}

// ------- Web search (all CORS-friendly so it works from the browser) -------
async function wikipediaSearch(query: string): Promise<ToolResult> {
  try {
    const s = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srlimit=4&srsearch=${encodeURIComponent(
        query
      )}&format=json&origin=*`
    );
    const sd = await s.json();
    const titles = (sd?.query?.search || []).map((h: any) => h.title);
    if (!titles.length) return { ok: false, output: "No results." };
    const e = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&redirects=1&titles=${encodeURIComponent(
        titles.join("|")
      )}&format=json&origin=*`
    );
    const ed = await e.json();
    const pages = ed?.query?.pages || {};
    const lines: string[] = [];
    for (const k of Object.keys(pages)) {
      const p = pages[k];
      if (p.extract)
        lines.push(
          `- ${p.title}: ${p.extract.slice(0, 360)}\n  https://en.wikipedia.org/wiki/${encodeURIComponent(
            p.title.replace(/ /g, "_")
          )}`
        );
    }
    return { ok: lines.length > 0, output: lines.join("\n") || "No results." };
  } catch (e: any) {
    return { ok: false, output: `Wikipedia failed: ${e.message}` };
  }
}

async function jinaSearch(query: string): Promise<ToolResult> {
  // Jina reader returns markdown with real links preserved — fetch DuckDuckGo
  // results server-side (bypasses CORS + bot blocks) so the model gets clickable URLs.
  try {
    const res = await fetch(
      `https://r.jina.ai/https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      { headers: { "X-Return-Format": "markdown", "X-No-Cache": "true" } }
    );
    if (!res.ok) return { ok: false, output: "" };
    let md = await res.text();
    // Unwrap DuckDuckGo redirect links → real destination URLs.
    md = md.replace(/https?:\/\/(?:html\.)?duckduckgo\.com\/l\/\?uddg=([^)&\s]+)[^)\s]*/g, (_m, u) => {
      try { return decodeURIComponent(u); } catch { return _m; }
    });
    md = md.replace(/\n{3,}/g, "\n\n").trim();
    return { ok: md.length > 80, output: md.slice(0, 5000) };
  } catch {
    return { ok: false, output: "" };
  }
}

export async function webSearch(query: string): Promise<ToolResult> {
  const jina = await jinaSearch(query);
  if (jina.ok) return jina;
  return wikipediaSearch(query);
}

// ------- Browse a page via the Jina reader (CORS-friendly) -------
export async function browse(url: string): Promise<ToolResult> {
  try {
    const target = url.startsWith("http") ? url : `https://${url}`;
    const res = await fetch(`https://r.jina.ai/${target}`);
    const text = await res.text();
    return { ok: true, output: text.slice(0, 5000) };
  } catch (e: any) {
    return { ok: false, output: `Failed to fetch ${url}: ${e.message}` };
  }
}

// ------- Sandboxed code (browser, no node:vm) -------
export async function runCode(source: string): Promise<ToolResult> {
  try {
    const logs: string[] = [];
    const sandboxConsole = { log: (...a: any[]) => logs.push(a.map(String).join(" ")) };
    // Deny network/DOM by shadowing globals; run in a Function scope.
    // eslint-disable-next-line no-new-func
    const fn = new Function(
      "console",
      "Math",
      "JSON",
      "Date",
      "fetch",
      "window",
      "document",
      "globalThis",
      `"use strict"; return (function(){ ${source} \n })();`
    );
    const result = fn(sandboxConsole, Math, JSON, Date, undefined, undefined, undefined, undefined);
    const out: string[] = [];
    if (logs.length) out.push(logs.join("\n"));
    if (result !== undefined) out.push(`=> ${JSON.stringify(result)}`);
    return { ok: true, output: out.join("\n") || "(no output)" };
  } catch (e: any) {
    return { ok: false, output: `Error: ${e.message}` };
  }
}

export async function executeTool(
  name: string,
  args: any,
  connectors: Record<string, string> = {}
): Promise<ToolResult> {
  switch (name) {
    case "web_search":
      return webSearch(String(args.query || ""));
    case "browse":
      return browse(String(args.url || ""));
    case "code":
      return runCode(String(args.source || ""));
    case "github":
      return connectors.github
        ? githubTool(args, connectors.github)
        : { ok: false, output: "GitHub is not connected." };
    case "slack":
      return connectors.slack
        ? slackTool(args, connectors.slack)
        : { ok: false, output: "Slack is not connected." };
    default:
      return { ok: false, output: `Unknown tool: ${name}` };
  }
}

export function toolLabel(name: string, args: any): string {
  switch (name) {
    case "web_search":
      return `Searching the web: "${args.query}"`;
    case "browse":
      return `Browsing ${args.url}`;
    case "code":
      return `Running code`;
    case "github":
      return `GitHub: ${args.action}${args.repo ? ` (${args.repo})` : ""}`;
    case "slack":
      return `Posting to Slack`;
    case "create_agent":
      return `Creating agent: ${args.name || "new agent"}`;
    case "delegate":
      return `Delegating to @${args.handle}`;
    default:
      return name;
  }
}
