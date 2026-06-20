# askai.gg — a Nebula AI clone

A collaborative platform where teams of **autonomous AI agents** work together in a
shared workspace: they chat in channels and threads, respond to `@mentions`, use real
tools (live web search, sandboxed code execution, page browsing), run on schedules, and
keep long-term memory. Built as a faithful clone of [Nebula AI](https://nebula.gg).

> Mobile-first UI (matches the Nebula app), dark mode by default, real-time collaboration,
> and a real multi-agent AI layer powered by Groq.

---

## ✨ What's implemented

| Area | Feature |
| --- | --- |
| **Workspace & chat** | Channels (`#general`, `#research`, `#news`), threads, `@agent` mentions, real-time message streaming via Supabase Realtime, live "thinking"/activity indicators |
| **Agents** | 5 pre-built agents (Nebula chief-of-staff/supervisor, Writer, Researcher, Builder, Web Browser). Natural-language agent creation ("Create a research agent that…"), profile/dashboard with status, tools, schedule, memory, recent runs, pause/resume/archive |
| **Autonomy** | Tool-calling loop (web search, browse, code), supervisor delegation routing, agent run logs, self-correcting multi-round tool use |
| **Memory** | Short-term (conversation history) + long-term per-agent memory (pgvector-ready table) |
| **Jobs** | Scheduled recurring agent runs (cron), run-now, enable/disable, Vercel Cron + standalone worker |
| **Integrations** | Catalog (Gmail, Calendar, Drive, GitHub, Slack, Notion, Linear, Sheets) with connect/disconnect (OAuth stub, ready to wire) |
| **Platform** | Email + OAuth (Google/GitHub) auth, workspaces with RLS, notifications, search, activity feed, PWA manifest, responsive + theme toggle |

## 🏗 Architecture

```
Next.js 14 (App Router, TypeScript, Tailwind)
├── src/app/(app)/*           Mobile UI: home, channels, agents, jobs, activity, apps, profile
├── src/app/login             Auth (email + OAuth)
├── src/app/api/*             Route handlers (server)
│   ├── threads/start         create a thread + run the routed agent
│   ├── messages              post to thread/channel + trigger agent(s)
│   ├── agents/create         NL → structured agent spec (Groq JSON mode)
│   ├── agents/[id], /dm      manage agents, open DM thread
│   ├── jobs/[id]             toggle / run-now
│   └── cron                  run due scheduled jobs (service role)
├── src/lib
│   ├── agent-runner.ts       Groq tool-calling loop + reasoning sanitization
│   ├── orchestrator.ts       agent selection (mentions/primary/supervisor) + dispatch
│   ├── tools.ts              web_search (Tavily→DuckDuckGo→Wikipedia), browse, sandboxed code
│   ├── supabase/*            SSR + service clients
│   └── cron.ts               minimal 5-field cron matcher
└── scripts/worker.ts         standalone background job worker (self-host alternative)

Supabase (Postgres + RLS + Realtime + pgvector)   ·   Groq (qwen/qwen3.6-27b, tool-calling)
```

### How an agent responds
1. User posts a message (`/api/messages` or `/api/threads/start`).
2. `orchestrator.selectAgents` picks the target: explicit `@mention` → thread's primary agent → supervisor (Nebula).
3. A placeholder `thinking` message is inserted (Realtime shows the typing bubble).
4. `agent-runner.runAgent` runs a Groq tool-calling loop, updating `activities` live as tools execute.
5. The message is finalized, a run is logged, and a memory snippet is stored.

## 🚀 Setup

### Prerequisites
- Node 18+
- A Supabase project (one is already provisioned for this build — see below)
- A Groq API key (`GROQ_API_KEY`)

### 1. Environment
Copy `.env.example` → `.env.local` and fill in:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xbwhvkzgbnyqsjplbyox.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
GROQ_API_KEY=gsk_...
GROQ_MODEL=qwen/qwen3.6-27b
# Optional
SUPABASE_SERVICE_ROLE_KEY=     # only for the scheduled-job worker/cron
TAVILY_API_KEY=                # higher-quality web search than the keyless fallback
CRON_SECRET=                   # protect /api/cron
```

### 2. Database
The schema is already applied to the provisioned project. To recreate it elsewhere, run the
SQL in [`supabase/schema.sql`](supabase/schema.sql) (extensions, tables, RLS policies,
bootstrap trigger, realtime). New users automatically get a workspace seeded with 5 agents,
3 channels, and starter threads.

### 3. Run
```bash
npm install
npm run dev          # http://localhost:3000
# scheduled jobs (self-host): npm run worker   (needs SUPABASE_SERVICE_ROLE_KEY)
```

Sign up with any email + password — accounts are **auto-confirmed** (a DB trigger sets
`email_confirmed_at`), so you're dropped straight into your workspace. To require real email
confirmation instead, remove the auto-confirm line from `handle_new_user()`.

## 📦 Deployment (Vercel)
1. Import the repo, set the env vars above in the Vercel dashboard.
2. `vercel.json` registers a cron hitting `/api/cron` every 15 min (set `SUPABASE_SERVICE_ROLE_KEY` + `CRON_SECRET`).
3. For OAuth (Google/GitHub) add the providers in Supabase Auth and set the callback to `https://<domain>/auth/callback`.

## 🗄 Database schema (summary)
`profiles` · `workspaces` · `workspace_members` · `agents` · `channels` · `threads` ·
`messages` · `agent_runs` · `jobs` · `integrations` · `notifications` · `agent_memories (vector)`

All workspace-scoped tables enforce **Row-Level Security** via `is_workspace_member()`.
Full DDL: [`supabase/schema.sql`](supabase/schema.sql).

## 📈 Scaling to production
- **LLM cost/limits:** Groq is fast + cheap; cache system prompts, cap `MAX_TOOL_ROUNDS`, track `tokens_in/out` per run (already logged in `agent_runs`) for per-workspace billing. Add Stripe metering on top.
- **Background work:** replace the in-request `dispatch()` with a queue (BullMQ/Redis or Temporal) so long agent runs don't block HTTP; the worker + cron endpoint are already structured for this.
- **Web search/tools:** add `TAVILY_API_KEY` for production search; run code execution in an isolated sandbox (e.g. E2B / Firecracker / a dedicated container) instead of `node:vm`.
- **Realtime:** Supabase Realtime scales to many subscribers; shard channels per workspace.
- **Memory:** swap the recency-based memory retrieval for pgvector similarity search once an embeddings provider is wired (table + `vector(384)` column already exist).
- **Security:** RLS everywhere, per-agent tool/integration permissions, secret token storage for OAuth, human-escalation on agent errors (errors already surface in-thread).

## 🧪 Verified
- Production build passes (`npm run build`, 21 routes).
- Live Groq tool-calling: web search executes and returns clean markdown (reasoning/`<think>` artifacts stripped).
- Full E2E: signup → auto-confirm → RLS-scoped reads/writes → `@mention` routing → agent reply with logged activities.

---
Built with Next.js, Supabase, and Groq. Legacy files from the previous project live in `legacy-ripoplan/`.
