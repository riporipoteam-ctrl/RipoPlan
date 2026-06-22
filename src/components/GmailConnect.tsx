"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/lib/session";
import { getBackendUrl } from "@/lib/backend";

export function GmailConnect() {
  const supabase = createClient();
  const { ctx } = useSession();
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const backend = getBackendUrl();

  useEffect(() => {
    if (!ctx) return;
    supabase
      .from("integrations")
      .select("provider,status")
      .eq("workspace_id", ctx.workspace.id)
      .eq("provider", "gmail")
      .maybeSingle()
      .then(({ data }) => setConnected((data as any)?.status === "connected"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx?.workspace.id]);

  async function connect() {
    if (!ctx || !backend) return;
    setBusy(true);
    const popup = window.open(`${backend}/oauth/gmail/start`, "gmail-oauth", "width=480,height=640");
    const onMsg = async (e: MessageEvent) => {
      if (e.data?.type !== "agentnexus-oauth" || e.data?.provider !== "gmail") return;
      window.removeEventListener("message", onMsg);
      const token = e.data.token as string;
      if (token) {
        await supabase.from("integrations").upsert(
          { workspace_id: ctx.workspace.id, provider: "gmail", status: "connected", secret: token, account_label: "Gmail", connected_by: ctx.profile.id },
          { onConflict: "workspace_id,provider" } as any
        );
        setConnected(true);
      }
      setBusy(false);
      popup?.close();
    };
    window.addEventListener("message", onMsg);
    // Safety: stop spinner if the user closes the popup without finishing.
    const iv = setInterval(() => { if (popup?.closed) { clearInterval(iv); setBusy(false); window.removeEventListener("message", onMsg); } }, 800);
  }

  async function disconnect() {
    if (!ctx) return;
    setBusy(true);
    await supabase.from("integrations").update({ status: "available", secret: null }).eq("workspace_id", ctx.workspace.id).eq("provider", "gmail");
    setConnected(false);
    setBusy(false);
  }

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl text-lg text-white" style={{ background: "#ea4335" }}>✉️</div>
      <div className="min-w-0 flex-1">
        <div className="font-semibold">Gmail</div>
        <div className="truncate text-xs text-[var(--muted)]">
          {backend ? "Sign in with Google so agents can read your email" : "Needs the backend worker deployed"}
        </div>
      </div>
      {!backend ? (
        <span className="rounded-lg bg-black/5 px-3 py-1.5 text-xs text-[var(--muted)]">Unavailable</span>
      ) : (
        <button
          onClick={() => (connected ? disconnect() : connect())}
          disabled={busy}
          className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium ${connected ? "bg-emerald-100 text-emerald-700" : "bg-nebula-600 text-white"}`}
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : connected ? <Check size={14} /> : <Plus size={14} />}
          {connected ? "Connected" : "Sign in"}
        </button>
      )}
    </div>
  );
}
