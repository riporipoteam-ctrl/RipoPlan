# AgentNexus backend (Cloudflare Worker)

The app on GitHub Pages is fully static, so it can't hide API keys, do OAuth, or
run anything after you close the tab. This Worker adds exactly that:

- **cron + `POST /tasks/run`** — runs queued `background_tasks` server-side every
  minute, so **agents keep working after you close the app**. Needs
  `SUPABASE_SERVICE_KEY` + `NVIDIA_API_KEY`.
- **`POST /browse`** — server-side fetch/search (no CORS): the agents' "live browser".
- **`POST /gmail`** — proxy the Gmail API with the user's OAuth token.
- **`POST /llm`** — proxy **NVIDIA** / **Groq** with the key server-side.
- **`/oauth/:provider/start` + `/callback`** — real **Sign in with Google** for Gmail.

## Required secrets
Add in repo **Settings → Secrets and variables → Actions** (the deploy workflow
pushes them to the Worker):

The agent brain is **GLM-5.2 on Workers AI** (`@cf/zai-org/glm-5.2`) — it runs on
Cloudflare's own GPUs via the `AI` binding (no external host, no Ollama, no model
key; uses your account's Workers AI allowance).

| Secret | Needed for |
| --- | --- |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | deploying the Worker |
| `SUPABASE_SERVICE_KEY` | cron reading history & posting replies (Supabase → Settings → API → **service_role** key) |
| `NVIDIA_API_KEY` | image generation (FLUX) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Gmail sign-in |
| `GROQ_API_KEY` | (optional) proxy Groq |

Then set the **`BACKEND_URL`** repo *Variable* to the deployed
`https://agentnexus-backend.<you>.workers.dev`, and set the Google OAuth
**Authorized redirect URI** to `<worker-url>/oauth/gmail/callback`.

## Easiest: auto-deploy via GitHub Actions (recommended)
There's a workflow at `.github/workflows/worker.yml` that deploys this Worker to
**your Cloudflare account** automatically. You only add secrets once:

1. Repo **Settings → Secrets and variables → Actions** → add:
   - `CLOUDFLARE_API_TOKEN` — create one with the **"Edit Cloudflare Workers"** template at
     dash.cloudflare.com/profile/api-tokens
   - `CLOUDFLARE_ACCOUNT_ID` — from the Cloudflare dashboard URL / Workers overview
   - (optional) `NVIDIA_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
2. Run the **"Deploy Cloudflare Worker"** action (or push any change under `worker/`).

That's it — CI runs `wrangler deploy` and sets the secrets for you. Grab the
`*.workers.dev` URL from the action log.

## Or deploy manually (≈2 min)
```bash
cd worker
npm i -g wrangler
wrangler login
wrangler deploy
# then add secrets:
wrangler secret put NVIDIA_API_KEY        # from https://build.nvidia.com
wrangler secret put GROQ_API_KEY          # optional (hide the Groq key)
wrangler secret put GOOGLE_CLIENT_ID      # Google Cloud OAuth (Web app)
wrangler secret put GOOGLE_CLIENT_SECRET
```
Set the Google OAuth **Authorized redirect URI** to
`https://<your-worker>.workers.dev/oauth/gmail/callback` (and one per provider).

## Wire it to the app
Add the deployed URL in the app: **Settings → Backend URL** (field reads
`localStorage.agentnexus_backend`). Once set:
- NVIDIA models appear in the model picker and route through `/llm`.
- Connectors show **Sign in with Google** instead of asking for a token.

> Until this Worker is deployed and its URL is set, the app keeps working exactly
> as today (Groq in the browser, GitHub/Slack via token). Nothing breaks.
