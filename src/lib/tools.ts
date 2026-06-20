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
};

export function schemasForTools(tools: string[]) {
  const names = new Set(tools);
  return Object.entries(TOOL_SCHEMAS)
    .filter(([k]) => names.has(k))
    .map(([, v]) => v);
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
  // Use the Jina reader to fetch DuckDuckGo's HTML results server-side (bypasses
  // browser CORS + bot blocks) and return readable text.
  try {
    const res = await fetch(
      `https://r.jina.ai/https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      { headers: { "X-Return-Format": "text" } }
    );
    if (!res.ok) return { ok: false, output: "" };
    const text = await res.text();
    const clean = text.replace(/\n{3,}/g, "\n\n").trim();
    return { ok: clean.length > 80, output: clean.slice(0, 4000) };
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

export async function executeTool(name: string, args: any): Promise<ToolResult> {
  switch (name) {
    case "web_search":
      return webSearch(String(args.query || ""));
    case "browse":
      return browse(String(args.url || ""));
    case "code":
      return runCode(String(args.source || ""));
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
    default:
      return name;
  }
}
