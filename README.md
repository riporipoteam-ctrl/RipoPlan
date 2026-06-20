# askai.gg — a Nebula AI clone (100% serverless, runs on GitHub Pages)

A collaborative platform where teams of **autonomous AI agents** work together in a shared
workspace: they chat in channels and threads, respond to `@mentions`, use real tools (live web
search, page browsing, sandboxed code), run on schedules, and keep memory. Mobile-first dark UI
matching the Nebula app.

**It runs entirely in the browser** — no server, no Vercel. The static site is hosted on
**GitHub Pages**; Supabase (auth + DB + realtime, all client-side) and Groq (called directly from
the browser) do the rest.

🔗 **Live:** https://riporipoteam-ctrl.github.io/RipoPlan/

## How it's serverless
| Concern | Solution |
| --- | --- |
| Hosting | Next.js **static export** (`output: 'export'`) deployed to GitHub Pages via Actions |
| Auth / DB / realtime | Supabase **browser client** with Row-Level Security (anon key is public by design) |
| AI | **Groq** called directly from the browser (CORS-enabled); `qwen/qwen3.6-27b` with tool-calling |
| Tools | `web_search` (Jina reader + Wikipedia, CORS-friendly), `browse` (Jina reader), `code` (in-browser sandbox) |
| Agent orchestration | Runs client-side in `src/lib/{agent-runner,orchestrator,tools}.ts` |

> ⚠️ Because there is no server, the Groq API key is **shipped in the public bundle**. Use a key
> you're willing to expose and can rotate. This is the inherent trade-off of a serverless static deploy.

## Features (20 routes)
- **Workspace chat** — channels, threads, `@agent` mentions, real-time messages + live activity/“thinking” indicators
- **Agents** — 5 pre-built (Nebula supervisor, Writer, Researcher, Builder, Web Browser), natural-language creation, dashboards (logs, pause/resume/archive)
- **Autonomy** — multi-round tool-calling loop, supervisor routing, run logs with token counts
- **Jobs** — scheduled runs (run while the app is open; point a Supabase cron/Edge Function at it for true 24/7)
- **Knowledge base** (wired into agent context), memory, integrations catalog, activity feed, search, settings/usage, devices, mini-apps
- Email auth (auto-confirm) + OAuth, workspaces, full **RLS**, auto-seeding bootstrap trigger

## Run locally
```bash
npm install
npm run dev      # http://localhost:3000  — sign up and you're in a seeded workspace
```
Config is optional — public Supabase + Groq fallbacks are baked in. To use your own, copy
`.env.example` → `.env.local` and set the `NEXT_PUBLIC_*` values.

## Deploy to GitHub Pages
Already wired. On every push to `main`, `.github/workflows/pages.yml`:
1. builds the static export (`npm run build` → `out/`),
2. enables Pages (GitHub Actions source) and deploys it.

GitHub Pages serves project sites under `/<repo>/`, so `next.config.mjs` sets
`basePath: '/RipoPlan'`. Change `repo` there if you fork under a different name.

To use your **own** Groq/Supabase, either edit the fallbacks in `src/lib/groq.ts` &
`src/lib/supabase/client.ts`, or add the `NEXT_PUBLIC_*` values as build env in the workflow.

## Database
Schema (tables, RLS, realtime, auto-seeding signup trigger, auto-confirm) is in
[`supabase/schema.sql`](supabase/schema.sql) and already applied to the live project. New users get
a workspace seeded with 5 agents, 3 channels, and starter threads.

## Project structure
```
src/app/(app)/*     mobile UI pages (all client components)
src/app/login       auth
src/lib
  ├── session.tsx       client auth/workspace provider (useSession)
  ├── actions.ts        all writes (replaces server API routes)
  ├── agent-runner.ts   Groq tool-calling loop + reasoning sanitization
  ├── orchestrator.ts   agent selection (mention/primary/supervisor) + dispatch
  ├── tools.ts          browser-safe web_search / browse / code
  └── supabase/client.ts
.github/workflows/pages.yml   build + deploy to GitHub Pages
```

Legacy RipoPlan files live in `legacy-ripoplan/`.
