"use client";

import { useState } from "react";
import { Check, Loader2, Plus, X, ExternalLink, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/lib/session";
import { toggleIntegration } from "@/lib/actions";

// Credential config per provider. `live` = agents can actually act on it from
// the browser today; others store the credential for when a backend is added.
const CRED: Record<string, { label: string; placeholder: string; help: string; link?: string; live?: boolean }> = {
  github: {
    label: "Personal Access Token",
    placeholder: "ghp_…",
    help: "Create a fine-grained or classic token with 'repo' scope. Agents can list repos, search, and open issues.",
    link: "https://github.com/settings/tokens",
    live: true,
  },
  slack: {
    label: "Incoming Webhook URL",
    placeholder: "https://hooks.slack.com/services/…",
    help: "Create an Incoming Webhook for a channel. Agents can post messages to it.",
    link: "https://api.slack.com/messaging/webhooks",
    live: true,
  },
  gmail: { label: "OAuth access token", placeholder: "ya29.…", help: "Paste a Google OAuth access token with Gmail scope. (Full OAuth needs a backend.)", link: "https://developers.google.com/oauthplayground" },
  google_calendar: { label: "OAuth access token", placeholder: "ya29.…", help: "Google OAuth token with Calendar scope.", link: "https://developers.google.com/oauthplayground" },
  google_drive: { label: "OAuth access token", placeholder: "ya29.…", help: "Google OAuth token with Drive scope.", link: "https://developers.google.com/oauthplayground" },
  sheets: { label: "OAuth access token", placeholder: "ya29.…", help: "Google OAuth token with Sheets scope.", link: "https://developers.google.com/oauthplayground" },
  notion: { label: "Internal Integration Secret", placeholder: "secret_…", help: "Create an internal integration and share pages with it.", link: "https://www.notion.so/my-integrations" },
  linear: { label: "API Key", placeholder: "lin_api_…", help: "Create a personal API key in Linear settings.", link: "https://linear.app/settings/api" },
};

export function IntegrationCard({
  provider,
  label,
  description,
  glyph,
  color,
  connected,
}: {
  provider: string;
  label: string;
  description: string;
  glyph: string;
  color: string;
  connected: boolean;
}) {
  const supabase = createClient();
  const { ctx } = useSession();
  const [isConnected, setConnected] = useState(connected);
  const [open, setOpen] = useState(false);
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const cfg = CRED[provider];

  async function connect() {
    if (!ctx || !secret.trim()) return;
    setBusy(true);
    await toggleIntegration(supabase, ctx, provider, true, secret.trim());
    setConnected(true);
    setOpen(false);
    setSecret("");
    setBusy(false);
  }

  async function disconnect() {
    if (!ctx) return;
    setBusy(true);
    await toggleIntegration(supabase, ctx, provider, false);
    setConnected(false);
    setBusy(false);
  }

  return (
    <>
      <div className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl text-lg text-white" style={{ background: color }}>
          {glyph}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 font-semibold">
            {label}
            {cfg?.live && (
              <span className="flex items-center gap-0.5 rounded bg-emerald-100 px-1 py-0.5 text-[10px] font-bold text-emerald-700">
                <Zap size={9} /> LIVE
              </span>
            )}
          </div>
          <div className="truncate text-xs text-[var(--muted)]">{description}</div>
        </div>
        <button
          onClick={() => (isConnected ? disconnect() : setOpen(true))}
          disabled={busy}
          className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium ${
            isConnected ? "bg-emerald-100 text-emerald-700" : "bg-nebula-600 text-white"
          }`}
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : isConnected ? <Check size={14} /> : <Plus size={14} />}
          {isConnected ? "Connected" : "Connect"}
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-t-3xl border border-[var(--border)] bg-[var(--card)] p-5 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg text-white" style={{ background: color }}>{glyph}</span>
                <span className="font-bold">Connect {label}</span>
              </div>
              <button onClick={() => setOpen(false)} className="text-[var(--muted)]"><X size={18} /></button>
            </div>
            <p className="mb-3 text-sm text-[var(--muted)]">{cfg?.help || "Paste your credential to connect."}</p>
            <input
              autoFocus
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder={cfg?.placeholder || "Paste credential…"}
              className="w-full rounded-xl border border-[var(--border)] bg-transparent px-3 py-2.5 text-sm outline-none focus:border-nebula-500"
            />
            {cfg?.link && (
              <a href={cfg.link} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-nebula-600">
                Where do I get this? <ExternalLink size={11} />
              </a>
            )}
            <p className="mt-3 text-[11px] text-[var(--muted)]">
              Stored in your workspace (Supabase, RLS-protected). {cfg?.live ? "Agents can act on this immediately." : "Full live actions for this provider need a backend; the credential is saved for then."}
            </p>
            <button
              onClick={connect}
              disabled={busy || !secret.trim()}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-nebula-600 to-nebula-pink py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Connect
            </button>
          </div>
        </div>
      )}
    </>
  );
}
