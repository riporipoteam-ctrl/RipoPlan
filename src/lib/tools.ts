import vm from "node:vm";

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
        "Search the live web for current information (news, prices, facts, schedules). Returns top results with titles, snippets and URLs.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The search query" },
        },
        required: ["query"],
      },
    },
  },
  browse: {
    type: "function",
    function: {
      name: "browse",
      description: "Fetch a single web page URL and return its readable text content.",
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
        "Execute a snippet of JavaScript in a sandbox to compute results, transform data, or do math. The value of the last expression (or anything passed to return) is captured. No network or filesystem access.",
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
  // delegate is handled by the supervisor flow, not as a raw tool here
  return Object.entries(TOOL_SCHEMAS)
    .filter(([k]) => names.has(k))
    .map(([, v]) => v);
}

// ---------------- Web search ----------------
async function tavilySearch(query: string): Promise<ToolResult | null> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        query,
        max_results: 6,
        include_answer: true,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const lines: string[] = [];
    if (data.answer) lines.push(`Answer: ${data.answer}\n`);
    for (const r of data.results || []) {
      lines.push(`- ${r.title}\n  ${r.url}\n  ${r.content?.slice(0, 280) || ""}`);
    }
    return { ok: true, output: lines.join("\n") || "No results." };
  } catch {
    return null;
  }
}

async function duckduckgoSearch(query: string): Promise<ToolResult> {
  try {
    const res = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
      { headers: { "User-Agent": "askai.gg/1.0" } }
    );
    const data = await res.json();
    const lines: string[] = [];
    if (data.AbstractText) lines.push(`${data.AbstractText} (${data.AbstractURL})`);
    const topics = (data.RelatedTopics || []).flatMap((t: any) =>
      t.Topics ? t.Topics : [t]
    );
    for (const t of topics.slice(0, 8)) {
      if (t.Text) lines.push(`- ${t.Text}${t.FirstURL ? `\n  ${t.FirstURL}` : ""}`);
    }
    if (lines.length === 0) {
      // Fallback to HTML endpoint scrape
      return await duckduckgoHtml(query);
    }
    return { ok: true, output: lines.join("\n") };
  } catch {
    return await duckduckgoHtml(query);
  }
}

async function duckduckgoHtml(query: string): Promise<ToolResult> {
  try {
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; askai.gg/1.0)" },
    });
    const html = await res.text();
    const matches = [...html.matchAll(/result__a[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gs)];
    const lines = matches.slice(0, 8).map((m) => {
      const title = m[2].replace(/<[^>]+>/g, "").trim();
      return `- ${title}\n  ${decodeURIComponent(m[1])}`;
    });
    return { ok: lines.length > 0, output: lines.join("\n") || "No results found." };
  } catch (e: any) {
    return { ok: false, output: `Search failed: ${e.message}` };
  }
}

async function wikipediaSearch(query: string): Promise<ToolResult> {
  try {
    const sres = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srlimit=4&srsearch=${encodeURIComponent(
        query
      )}&format=json&origin=*`,
      { headers: { "User-Agent": "askai.gg/1.0" } }
    );
    const sdata = await sres.json();
    const hits = sdata?.query?.search || [];
    if (!hits.length) return { ok: false, output: "No results." };
    const titles = hits.map((h: any) => h.title);

    // Fetch intro extracts for the top pages
    const eres = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&redirects=1&titles=${encodeURIComponent(
        titles.join("|")
      )}&format=json&origin=*`,
      { headers: { "User-Agent": "askai.gg/1.0" } }
    );
    const edata = await eres.json();
    const pages = edata?.query?.pages || {};
    const lines: string[] = [];
    for (const k of Object.keys(pages)) {
      const p = pages[k];
      if (p.extract) {
        lines.push(
          `- ${p.title}: ${p.extract.slice(0, 360)}\n  https://en.wikipedia.org/wiki/${encodeURIComponent(
            p.title.replace(/ /g, "_")
          )}`
        );
      }
    }
    return { ok: lines.length > 0, output: lines.join("\n") || "No results." };
  } catch (e: any) {
    return { ok: false, output: `Wikipedia search failed: ${e.message}` };
  }
}

export async function webSearch(query: string): Promise<ToolResult> {
  // 1. Best quality if configured
  const t = await tavilySearch(query);
  if (t && t.ok) return t;

  // 2. DuckDuckGo instant answers (frequently rate-limited for bots)
  const ddg = await duckduckgoSearch(query);
  if (ddg.ok && ddg.output && !/No results/i.test(ddg.output)) return ddg;

  // 3. Reliable keyless fallback
  const wiki = await wikipediaSearch(query);
  if (wiki.ok) return wiki;

  return ddg.ok ? ddg : wiki;
}

// ---------------- Browse ----------------
export async function browse(url: string): Promise<ToolResult> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; askai.gg/1.0)" },
    });
    let html = await res.text();
    html = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return { ok: true, output: html.slice(0, 4000) };
  } catch (e: any) {
    return { ok: false, output: `Failed to fetch ${url}: ${e.message}` };
  }
}

// ---------------- Sandboxed code ----------------
export async function runCode(source: string): Promise<ToolResult> {
  try {
    const logs: string[] = [];
    const sandbox = {
      console: { log: (...a: any[]) => logs.push(a.map(String).join(" ")) },
      Math,
      Date,
      JSON,
      result: undefined as unknown,
    };
    const context = vm.createContext(sandbox);
    const wrapped = `result = (function(){ ${source} \n })();`;
    vm.runInContext(wrapped, context, { timeout: 2000 });
    const out: string[] = [];
    if (logs.length) out.push(logs.join("\n"));
    if (sandbox.result !== undefined) out.push(`=> ${JSON.stringify(sandbox.result)}`);
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
