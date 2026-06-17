# askai.gg

askai.gg is a Nebula-inspired full-stack MVP for creating, coordinating, and monitoring autonomous AI agents in a shared workspace. The current implementation focuses on the core magical loop:

- Shared channels and a dark, collaborative workspace UI
- Mention-triggered agent runs with visible public responses
- Natural-language agent drafting and creation
- Agent profiles, integrations, inbox, and settings surfaces
- Mock route handlers and data contracts designed to swap into Supabase, Redis, and real LLM orchestration

## Tech Stack

- Next.js 16 + React 19 + TypeScript
- Tailwind CSS 4
- Zustand for local client state
- Zod for API payload validation
- Vitest for unit tests

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Copy environment variables:

```bash
cp .env.example .env.local
```

3. Start the development server:

```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000)

## Useful Commands

```bash
npm run dev
npm run lint
npm run test
npm run build
npm run check
```

## Project Structure

```text
src/
  app/
    api/                   Route handlers for bootstrap, messages, agents, integrations, runs
    agents/                Agent directory and detail routes
    channels/              Shared workspace channel route
    inbox/                 Notification inbox route
    integrations/          Integration management route
    settings/              Workspace settings route
  components/
    agents/                Agent UI modules
    channels/              Channel workspace UI
    home/                  Home dashboard
    integrations/          Integration surfaces
    inbox/                 Inbox surfaces
    layout/                Shared app shell
    settings/              Settings surfaces
    shared/                Shared UI primitives
  hooks/                   Shared React hooks
  lib/                     Mock data, schemas, helpers, and shared types
  store/                   Zustand workspace store
migrations/
  20260617_askai_gg_schema.sql
```

## MVP Notes

- The UI is fully navigable and mobile-responsive.
- Route handlers return realistic seeded payloads and validate write requests.
- Mentioning `@builder`, `@researcher`, `@writer`, or `@nebula` in a channel triggers simulated agent responses and run logs.
- Agent creation uses a natural-language draft flow before creating a new agent card.
- Current persistence is demo-oriented and client-side. The data contracts are already shaped for a Postgres + realtime backend.

## Production Upgrade Path

- Replace `src/lib/mock-data.ts` with Supabase repositories and row-level security.
- Move mention-triggered work into BullMQ, Temporal, or another durable job system.
- Add vector memory using `pgvector` with background embedding pipelines.
- Run external tools in isolated workers or containers with strict per-agent scopes.
- Add audit logs, rate limits, retries, idempotency keys, and cost tracking before production launch.

## Database Schema

- Schema DDL lives in `migrations/20260617_askai_gg_schema.sql`
- Product and architecture docs live in `.trae/documents/`

## Reference Alignment

This MVP intentionally mirrors the public Nebula-style experience:

- Workspace-first onboarding
- Starter team of visible specialist agents
- Public collaboration instead of invisible automation
- Agent detail pages with tools, prompts, triggers, and history
