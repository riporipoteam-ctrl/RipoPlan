import { getBackendUrl } from "./backend";

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

// Publishing a self-contained web app/site to the Mini Apps page.
TOOL_SCHEMAS.build_app = {
  type: "function",
  function: {
    name: "build_app",
    description:
      "Build and PUBLISH a complete website or web app to the Mini Apps page. Provide a full, self-contained single HTML document (inline CSS and JS, no external build step) in `html`. Use this instead of pasting code into chat — the user previews it in Mini Apps. Make it polished, responsive, and actually functional.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Short app/site name, e.g. 'Auto Repair Shop'" },
        description: { type: "string", description: "One sentence on what it is" },
        html: { type: "string", description: "A complete self-contained HTML document (<!doctype html>…), all CSS/JS inline." },
      },
      required: ["name", "html"],
    },
  },
};

// Preferred website builder: the model supplies STRUCTURED CONTENT only (small,
// never truncated) and we render it into a professionally-designed template, so
// the result always has real styling, a hero image, cards and animations.
TOOL_SCHEMAS.build_site = {
  type: "function",
  function: {
    name: "build_site",
    description:
      "Build and PUBLISH a beautiful website to Mini Apps. PREFER THIS over build_app. You only provide the CONTENT as structured fields — the platform renders a polished, responsive, animated design automatically. Always fill in real, specific copy.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Site / business name" },
        tagline: { type: "string", description: "Hero subtitle (one punchy sentence)" },
        theme: { type: "string", description: "Primary brand color as hex, e.g. #e11d48" },
        hero_keyword: { type: "string", description: "1-3 words describing the hero background photo, e.g. 'auto repair garage'" },
        cta: { type: "string", description: "Hero button text, e.g. 'Book an appointment'" },
        about: { type: "string", description: "A short 'about' paragraph" },
        features: {
          type: "array",
          description: "3-6 services/features as cards",
          items: { type: "object", properties: { title: { type: "string" }, text: { type: "string" }, icon: { type: "string", description: "one emoji" } } },
        },
        gallery: { type: "array", description: "2-6 keywords for gallery photos", items: { type: "string" } },
        testimonials: { type: "array", items: { type: "object", properties: { name: { type: "string" }, text: { type: "string" } } } },
        contact: { type: "object", properties: { phone: { type: "string" }, email: { type: "string" }, address: { type: "string" } } },
      },
      required: ["name", "tagline", "features"],
    },
  },
};

const esc = (s: any) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const img = (kw: string, w = 1600, h = 900) => `https://picsum.photos/seed/${encodeURIComponent(String(kw || "site").toLowerCase().replace(/[^a-z0-9]+/g, "-"))}/${w}/${h}`;

/** Render a structured site spec into a polished, self-contained HTML document. */
export function renderSite(spec: any): string {
  const name = esc(spec.name || "My Website");
  const theme = /^#[0-9a-fA-F]{6}$/.test(spec.theme || "") ? spec.theme : "#6d5efc";
  const tagline = esc(spec.tagline || "Welcome");
  const cta = esc(spec.cta || "Get in touch");
  const features = Array.isArray(spec.features) ? spec.features : [];
  const gallery = Array.isArray(spec.gallery) ? spec.gallery : [];
  const testimonials = Array.isArray(spec.testimonials) ? spec.testimonials : [];
  const c = spec.contact || {};
  const navLinks = [
    spec.about && ["about", "About"],
    features.length && ["services", "Services"],
    gallery.length && ["gallery", "Gallery"],
    testimonials.length && ["reviews", "Reviews"],
    (c.phone || c.email || c.address) && ["contact", "Contact"],
  ].filter(Boolean) as [string, string][];

  const featureCards = features
    .map(
      (f: any) => `<div class="card reveal"><div class="ico">${esc(f.icon || "✨")}</div><h3>${esc(f.title || "")}</h3><p>${esc(f.text || "")}</p></div>`
    )
    .join("");
  const galleryImgs = gallery.map((k: string) => `<img class="reveal" loading="lazy" src="${img(k, 800, 600)}" alt="${esc(k)}">`).join("");
  const testiCards = testimonials
    .map((t: any) => `<figure class="quote reveal"><blockquote>“${esc(t.text || "")}”</blockquote><figcaption>— ${esc(t.name || "Happy customer")}</figcaption></figure>`)
    .join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${name}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;800&display=swap" rel="stylesheet">
<style>
:root{--c:${theme};--ink:#15151c;--muted:#5b5b6b;--bg:#ffffff;--soft:#f5f5fb;--radius:18px}
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{font-family:'Plus Jakarta Sans',system-ui,sans-serif;color:var(--ink);background:var(--bg);line-height:1.6}
img{max-width:100%;display:block}
.wrap{max-width:1120px;margin:0 auto;padding:0 24px}
a{color:inherit;text-decoration:none}
header{position:sticky;top:0;z-index:50;background:rgba(255,255,255,.8);backdrop-filter:blur(12px);border-bottom:1px solid #eee}
nav{display:flex;align-items:center;justify-content:space-between;height:66px}
nav .brand{font-weight:800;font-size:1.2rem}
nav .links{display:flex;gap:26px}nav .links a{color:var(--muted);font-weight:600;font-size:.95rem}nav .links a:hover{color:var(--c)}
@media(max-width:680px){nav .links{display:none}}
.btn{display:inline-block;background:var(--c);color:#fff;font-weight:700;padding:14px 26px;border-radius:999px;box-shadow:0 10px 24px -10px var(--c);transition:transform .15s}
.btn:hover{transform:translateY(-2px)}
.hero{position:relative;min-height:88vh;display:flex;align-items:center;color:#fff;text-align:center;background:url('${img(spec.hero_keyword || spec.name)}') center/cover}
.hero::before{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(10,10,20,.55),rgba(10,10,20,.78))}
.hero .wrap{position:relative}
.hero h1{font-size:clamp(2.4rem,6vw,4.4rem);font-weight:800;letter-spacing:-.02em;max-width:14ch;margin:0 auto}
.hero p{font-size:clamp(1.05rem,2.5vw,1.4rem);opacity:.92;max-width:46ch;margin:18px auto 30px}
section{padding:96px 0}
.section-title{font-size:clamp(1.8rem,4vw,2.6rem);font-weight:800;letter-spacing:-.02em;text-align:center;margin-bottom:14px}
.section-sub{color:var(--muted);text-align:center;max-width:60ch;margin:0 auto 52px}
.soft{background:var(--soft)}
.grid{display:grid;gap:24px;grid-template-columns:repeat(auto-fit,minmax(250px,1fr))}
.card{background:#fff;border:1px solid #eee;border-radius:var(--radius);padding:30px;box-shadow:0 12px 30px -22px rgba(0,0,0,.4);transition:transform .2s,box-shadow .2s}
.card:hover{transform:translateY(-4px);box-shadow:0 20px 40px -24px rgba(0,0,0,.45)}
.card .ico{font-size:2rem;margin-bottom:12px}.card h3{font-size:1.2rem;margin-bottom:8px}.card p{color:var(--muted)}
.gallery{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
.gallery img{height:240px;width:100%;object-fit:cover;border-radius:var(--radius)}
.quotes{display:grid;gap:24px;grid-template-columns:repeat(auto-fit,minmax(280px,1fr))}
.quote{background:#fff;border-radius:var(--radius);padding:28px;border:1px solid #eee}
.quote blockquote{font-size:1.05rem;margin-bottom:14px}.quote figcaption{color:var(--c);font-weight:700}
.about{max-width:760px;margin:0 auto;text-align:center;font-size:1.2rem;color:var(--muted)}
.contact{display:flex;flex-wrap:wrap;gap:14px;justify-content:center;color:var(--muted);font-size:1.05rem}
.contact b{color:var(--ink)}
footer{padding:40px 0;text-align:center;color:var(--muted);border-top:1px solid #eee}
.reveal{opacity:0;transform:translateY(24px);transition:opacity .6s,transform .6s}
.reveal.in{opacity:1;transform:none}
</style></head>
<body>
<header><div class="wrap"><nav><span class="brand">${name}</span><div class="links">${navLinks.map(([id, l]) => `<a href="#${id}">${esc(l)}</a>`).join("")}</div>${(c.phone || c.email) ? `<a class="btn" href="#contact" style="padding:10px 20px">${cta}</a>` : ""}</nav></div></header>
<section class="hero"><div class="wrap"><h1>${name}</h1><p>${tagline}</p><a class="btn" href="#${navLinks[0]?.[0] || "contact"}">${cta}</a></div></section>
${spec.about ? `<section id="about"><div class="wrap"><h2 class="section-title">About us</h2><p class="about reveal">${esc(spec.about)}</p></div></section>` : ""}
${features.length ? `<section id="services" class="soft"><div class="wrap"><h2 class="section-title">What we offer</h2><p class="section-sub">Everything you need, done right.</p><div class="grid">${featureCards}</div></div></section>` : ""}
${gallery.length ? `<section id="gallery"><div class="wrap"><h2 class="section-title">Gallery</h2><div class="gallery">${galleryImgs}</div></div></section>` : ""}
${testimonials.length ? `<section id="reviews" class="soft"><div class="wrap"><h2 class="section-title">What customers say</h2><div class="quotes">${testiCards}</div></div></section>` : ""}
${(c.phone || c.email || c.address) ? `<section id="contact"><div class="wrap"><h2 class="section-title">Get in touch</h2><div class="contact reveal">${c.phone ? `<span><b>Phone:</b> ${esc(c.phone)}</span>` : ""}${c.email ? `<span><b>Email:</b> ${esc(c.email)}</span>` : ""}${c.address ? `<span><b>Address:</b> ${esc(c.address)}</span>` : ""}</div></div></section>` : ""}
<footer>© ${new Date().getFullYear()} ${name}. All rights reserved.</footer>
<script>
const io=new IntersectionObserver((es)=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}}),{threshold:.12});
document.querySelectorAll('.reveal').forEach(el=>io.observe(el));
</script>
</body></html>`;
}

export function schemasForTools(tools: string[]) {
  const names = new Set(tools);
  return Object.entries(TOOL_SCHEMAS)
    .filter(([k]) => names.has(k))
    .map(([, v]) => v);
}

// ---- Utility skills: keyless, always available to every agent ----
export const UTILITY_TOOL_SCHEMAS = [
  { type: "function", function: { name: "weather", description: "Get the current weather and a short forecast for a place.", parameters: { type: "object", properties: { location: { type: "string", description: "City / place name" } }, required: ["location"] } } },
  { type: "function", function: { name: "currency", description: "Convert an amount between two currencies (live rates).", parameters: { type: "object", properties: { amount: { type: "number" }, from: { type: "string", description: "ISO code e.g. USD" }, to: { type: "string", description: "ISO code e.g. EUR" } }, required: ["from", "to"] } } },
  { type: "function", function: { name: "crypto_price", description: "Get the current price of a cryptocurrency in USD.", parameters: { type: "object", properties: { coin: { type: "string", description: "Coin id/name e.g. bitcoin, ethereum, solana" } }, required: ["coin"] } } },
  { type: "function", function: { name: "dictionary", description: "Define a word and give synonyms.", parameters: { type: "object", properties: { word: { type: "string" } }, required: ["word"] } } },
  { type: "function", function: { name: "qr_code", description: "Generate a QR code image for any text or URL. Returns a Markdown image to show the user.", parameters: { type: "object", properties: { data: { type: "string" } }, required: ["data"] } } },
  { type: "function", function: { name: "datetime", description: "Get the current date and time (optionally for an IANA timezone).", parameters: { type: "object", properties: { timezone: { type: "string", description: "e.g. America/New_York" } } } } },
];

async function weatherTool(location: string): Promise<ToolResult> {
  try {
    const g = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(location)}`).then((r) => r.json());
    const loc = g?.results?.[0];
    if (!loc) return { ok: false, output: `Couldn't find "${location}".` };
    const w = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=3`).then((r) => r.json());
    const c = w.current;
    const d = w.daily;
    const days = (d?.time || []).map((t: string, i: number) => `${t}: ${d.temperature_2m_min[i]}–${d.temperature_2m_max[i]}°C`).join("; ");
    return { ok: true, output: `Weather in ${loc.name}, ${loc.country}: ${c.temperature_2m}°C (feels ${c.apparent_temperature}°C), humidity ${c.relative_humidity_2m}%, wind ${c.wind_speed_10m} km/h.\nNext days: ${days}` };
  } catch (e: any) { return { ok: false, output: `Weather failed: ${e.message}` }; }
}

async function currencyTool(args: any): Promise<ToolResult> {
  try {
    const amt = Number(args.amount) || 1;
    const r = await fetch(`https://api.frankfurter.app/latest?amount=${amt}&from=${encodeURIComponent(args.from)}&to=${encodeURIComponent(args.to)}`).then((x) => x.json());
    const val = r?.rates?.[String(args.to).toUpperCase()];
    if (val == null) return { ok: false, output: "Couldn't convert those currencies." };
    return { ok: true, output: `${amt} ${String(args.from).toUpperCase()} = ${val} ${String(args.to).toUpperCase()} (as of ${r.date}).` };
  } catch (e: any) { return { ok: false, output: `Currency failed: ${e.message}` }; }
}

async function cryptoTool(coin: string): Promise<ToolResult> {
  try {
    const id = coin.toLowerCase().replace(/\s+/g, "-");
    const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=usd&include_24hr_change=true`).then((x) => x.json());
    const d = r?.[id];
    if (!d) return { ok: false, output: `Couldn't find "${coin}".` };
    return { ok: true, output: `${coin}: $${d.usd} (24h ${d.usd_24h_change?.toFixed(2)}%).` };
  } catch (e: any) { return { ok: false, output: `Crypto failed: ${e.message}` }; }
}

async function dictionaryTool(word: string): Promise<ToolResult> {
  try {
    const r = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`).then((x) => x.json());
    const e = Array.isArray(r) ? r[0] : null;
    if (!e) return { ok: false, output: `No definition for "${word}".` };
    const defs = (e.meanings || []).slice(0, 3).map((m: any) => `(${m.partOfSpeech}) ${m.definitions?.[0]?.definition}`).join("\n");
    const syn = (e.meanings || []).flatMap((m: any) => m.synonyms || []).slice(0, 6).join(", ");
    return { ok: true, output: `**${e.word}**\n${defs}${syn ? `\nSynonyms: ${syn}` : ""}` };
  } catch (e: any) { return { ok: false, output: `Dictionary failed: ${e.message}` }; }
}

function qrTool(data: string): ToolResult {
  const url = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(data)}`;
  return { ok: true, output: `QR code generated. Show it to the user with this Markdown:\n![QR code](${url})` };
}

function datetimeTool(tz?: string): ToolResult {
  try {
    const now = new Date();
    const s = now.toLocaleString("en-US", { dateStyle: "full", timeStyle: "long", timeZone: tz || undefined });
    return { ok: true, output: `Current date & time${tz ? ` (${tz})` : ""}: ${s}` };
  } catch { return { ok: true, output: `Current date & time: ${new Date().toString()}` }; }
}

// ---- Rank management tools (exposed only to the supervisor / AgentNexus) ----
export const RANK_TOOL_SCHEMAS = [
  {
    type: "function",
    function: {
      name: "create_rank",
      description: "Create a new rank (a titled badge) in this workspace. Use when the user asks to make a rank/role/title for agents.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Rank name, e.g. 'Senior Engineer'" },
          badge: { type: "string", description: "One badge keyword: crown, star, shield, medal, gem, fire, trophy, flag, diamond, bolt, rocket, brain" },
          color: { type: "string", description: "Hex color like #a855f7 (optional)" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "assign_rank",
      description: "Assign (or remove) a rank to an agent by name. Use when the user asks to give an agent a rank/title/badge.",
      parameters: {
        type: "object",
        properties: {
          agent: { type: "string", description: "The agent's name or handle" },
          rank: { type: "string", description: "The rank name to assign, or empty string to remove the agent's rank" },
        },
        required: ["agent", "rank"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_rank",
      description: "Rename a rank or change its badge/color. Use when the user asks to edit/recolor/rename a rank.",
      parameters: {
        type: "object",
        properties: {
          rank: { type: "string", description: "The current rank name to edit" },
          name: { type: "string", description: "New name (optional)" },
          badge: { type: "string", description: "New badge keyword (optional)" },
          color: { type: "string", description: "New hex color (optional)" },
        },
        required: ["rank"],
      },
    },
  },
];

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
  gmail: {
    type: "function",
    function: {
      name: "gmail",
      description:
        "Read the connected Gmail inbox. action 'list' (recent emails, optional search query 'q'), or 'read' a specific message by 'id'.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["list", "read"] },
          q: { type: "string", description: "Gmail search query, e.g. 'from:boss is:unread'" },
          id: { type: "string", description: "Message id to read" },
        },
        required: ["action"],
      },
    },
  },
};

async function gmailTool(args: any, token: string): Promise<ToolResult> {
  const base = getBackendUrl();
  if (!base) return { ok: false, output: "Gmail needs the backend worker to be configured." };
  try {
    const res = await fetch(`${base}/gmail`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, action: args.action || "list", q: args.q, id: args.id }),
    });
    const d = await res.json();
    if (args.action === "read" && d.message) {
      const headers = (d.message.payload?.headers || []).reduce((a: any, h: any) => ((a[h.name] = h.value), a), {});
      return { ok: true, output: `From: ${headers.From}\nSubject: ${headers.Subject}\nDate: ${headers.Date}\n\n${d.message.snippet || ""}` };
    }
    const items = (d.items || []).map((m: any) => `- **${m.subject}** — ${m.from} (${m.date})\n  ${m.snippet}  [id: ${m.id}]`);
    return { ok: items.length > 0, output: items.join("\n") || "No emails found." };
  } catch (e: any) {
    return { ok: false, output: `Gmail request failed: ${e.message}` };
  }
}

/** Tool schemas for providers the workspace has connected. */
export function connectorSchemas(connectors: Record<string, string>) {
  return Object.keys(connectors)
    .filter((p) => CONNECTOR_TOOL_SCHEMAS[p])
    .map((p) => CONNECTOR_TOOL_SCHEMAS[p]);
}

// Image generation via the Cloudflare NVIDIA worker (FLUX).
export const IMAGE_TOOL_SCHEMA = {
  type: "function",
  function: {
    name: "generate_image",
    description:
      "Generate an image from a text description (logos, art, photos, product shots, designs). The image is shown to the user automatically.",
    parameters: {
      type: "object",
      properties: { prompt: { type: "string", description: "Detailed description of the image to create" } },
      required: ["prompt"],
    },
  },
};

export async function generateImage(backendUrl: string, prompt: string): Promise<{ ok: boolean; url?: string; error?: string }> {
  try {
    const res = await fetch(`${backendUrl.replace(/\/+$/, "")}/image/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    const d = await res.json();
    if (d.image) return { ok: true, url: d.image };
    return { ok: false, error: d.error || "Image generation failed." };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
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
  // Primary (verified keyless): r.jina.ai renders DuckDuckGo Lite server-side and
  // returns real result links as markdown. We decode the uddg= redirects to real
  // URLs. This is the most reliable keyless search from the browser — no API key.
  try {
    const ddgUrl = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
    const res = await fetch(`https://r.jina.ai/${ddgUrl}`, {
      headers: { "X-Return-Format": "markdown", "X-No-Cache": "true" },
    });
    if (res.ok) {
      let md = await res.text();
      md = md.replace(/https?:\/\/(?:[a-z]+\.)?duckduckgo\.com\/l\/\?[^)\s]*uddg=([^)&\s]+)[^)\s]*/gi, (_m, u) => {
        try { return decodeURIComponent(u); } catch { return _m; }
      });
      md = md.replace(/\n{3,}/g, "\n\n").trim();
      if (md.length > 120) return { ok: true, output: md.slice(0, 6000) };
    }
  } catch {}
  // Fallback: s.jina.ai search (returns top results already rendered to markdown).
  try {
    const res = await fetch(`https://s.jina.ai/${encodeURIComponent(query)}`, {
      headers: { "X-Return-Format": "markdown", Accept: "text/plain" },
    });
    if (res.ok) {
      const md = (await res.text()).replace(/\n{3,}/g, "\n\n").trim();
      if (md.length > 120) return { ok: true, output: md.slice(0, 6000) };
    }
  } catch {}
  return { ok: false, output: "" };
}

// Fetch a URL's raw text through whichever CORS proxy works (browser-safe).
async function corsGet(url: string): Promise<string> {
  const proxies = [
    (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
    (u: string) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
    (u: string) => `https://thingproxy.freeboard.io/fetch/${u}`,
  ];
  for (const p of proxies) {
    try {
      const res = await fetch(p(url));
      if (res.ok) {
        const t = await res.text();
        if (t && t.length > 60) return t;
      }
    } catch {}
  }
  return "";
}

// CORS proxy fallback: fetch DuckDuckGo HTML and parse real result links.
async function proxyDdgSearch(query: string): Promise<ToolResult> {
  try {
    const target = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const html = await corsGet(target);
    if (!html) return { ok: false, output: "" };
    const out: string[] = [];
    const re = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:result__snippet[^>]*>([\s\S]*?)<\/a>)?/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) && out.length < 6) {
      let url = m[1];
      const um = url.match(/uddg=([^&]+)/);
      if (um) try { url = decodeURIComponent(um[1]); } catch {}
      const title = m[2].replace(/<[^>]+>/g, "").trim();
      const snip = (m[3] || "").replace(/<[^>]+>/g, "").trim();
      if (title && url.startsWith("http")) out.push(`- [${title}](${url})${snip ? `\n  ${snip}` : ""}`);
    }
    return { ok: out.length > 0, output: out.join("\n") };
  } catch {
    return { ok: false, output: "" };
  }
}

/** When the backend worker is configured, search/browse server-side (no CORS,
 * more reliable). Falls back to the in-browser methods on any failure. */
async function backendBrowse(opts: { url?: string; query?: string }): Promise<ToolResult | null> {
  const base = getBackendUrl();
  if (!base) return null;
  try {
    const res = await fetch(`${base}/browse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(opts),
    });
    const d = await res.json();
    if (d?.content && String(d.content).length > 80) return { ok: true, output: String(d.content).slice(0, 6000) };
  } catch {}
  return null;
}

export async function webSearch(query: string): Promise<ToolResult> {
  const viaBackend = await backendBrowse({ query });
  if (viaBackend) return viaBackend;
  let base = await jinaSearch(query);
  if (!base.ok || base.output.length < 120) {
    const ddg = await proxyDdgSearch(query);
    if (ddg.ok) base = ddg;
  }
  if (!base.ok || base.output.length < 80) {
    const ddg = await proxyDdgSearch(query);
    if (ddg.ok) base = ddg;
  }
  if (!base.ok) base = await wikipediaSearch(query);
  // Hard "no results" signal so the agent reports it instead of inventing data.
  if (!base.ok || base.output.replace(/\s/g, "").length < 40) {
    return { ok: false, output: "NO_LIVE_RESULTS — the live web search returned nothing usable. Tell the user you couldn't fetch live results right now and do NOT invent any names, prices, or links." };
  }
  // Deep search: open the top real result and pull its actual content so the
  // agent gives concrete facts/links, not just a list of site names.
  const link = (base.output.match(/https?:\/\/(?!(?:html\.)?duckduckgo\.com)[^\s)\]"']+/i) || [])[0];
  if (link) {
    const page = await browse(link);
    if (page.ok && page.output.length > 200) {
      base = {
        ok: true,
        output: `${base.output}\n\n--- Top result content (${link}) ---\n${page.output.slice(0, 3000)}`,
      };
    }
  }
  return base;
}

// ------- Browse a page via the Jina reader (CORS-friendly) -------
export async function browse(url: string): Promise<ToolResult> {
  const viaBackend = await backendBrowse({ url });
  if (viaBackend) return viaBackend;
  const target = url.startsWith("http") ? url : `https://${url}`;
  // Jina reader renders the page server-side (executes JS) and returns markdown.
  try {
    const res = await fetch(`https://r.jina.ai/${target}`, { headers: { "X-Return-Format": "markdown" } });
    if (res.ok) {
      const text = await res.text();
      if (text.length > 80) return { ok: true, output: text.slice(0, 6000) };
    }
  } catch {}
  // Fallback: CORS proxy + strip tags.
  const html = await corsGet(target);
  if (html) {
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (text.length > 80) return { ok: true, output: text.slice(0, 6000) };
  }
  return { ok: false, output: `Couldn't fetch ${url} — the page may be blocking automated access.` };
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
    case "gmail":
      return connectors.gmail
        ? gmailTool(args, connectors.gmail)
        : { ok: false, output: "Gmail is not connected." };
    case "weather":
      return weatherTool(String(args.location || ""));
    case "currency":
      return currencyTool(args);
    case "crypto_price":
      return cryptoTool(String(args.coin || ""));
    case "dictionary":
      return dictionaryTool(String(args.word || ""));
    case "qr_code":
      return qrTool(String(args.data || ""));
    case "datetime":
      return datetimeTool(args.timezone);
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
    case "build_app":
    case "build_site":
      return `Designing site: ${args.name || "website"}`;
    case "create_rank":
      return `Creating rank: ${args.name || "rank"}`;
    case "assign_rank":
      return `Assigning ${args.agent} → ${args.rank || "no rank"}`;
    case "edit_rank":
      return `Editing rank: ${args.rank}`;
    case "generate_image":
      return `Generating image`;
    case "weather":
      return `Checking weather: ${args.location || ""}`;
    case "currency":
      return `Converting ${args.from} → ${args.to}`;
    case "crypto_price":
      return `Checking ${args.coin} price`;
    case "dictionary":
      return `Looking up "${args.word}"`;
    case "qr_code":
      return `Generating QR code`;
    case "datetime":
      return `Checking the time`;
    default:
      return name;
  }
}
