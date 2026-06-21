# AgentNexus backend (Cloudflare Worker)

The app on GitHub Pages is fully static, so it can't hide API keys or do OAuth
token exchange. This optional Worker adds exactly that:

- **`POST /llm`** — proxy to **NVIDIA** (`build.nvidia.com`) and optionally **Groq**,
  keeping the keys server-side. This is what lets the app use the free NVIDIA models.
- **`GET /oauth/:provider/start` + `/callback`** — real **Sign in with Google**
  for Gmail / Calendar / Drive / Sheets (no key pasting). The callback posts the
  token back to the app, which stores it as a connected integration.

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
