"use client";

import { useState } from "react";
import { Check, Loader2, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/lib/session";
import { toggleIntegration } from "@/lib/actions";

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
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (!ctx) return;
    setBusy(true);
    await toggleIntegration(supabase, ctx, provider, !isConnected);
    setConnected((c) => !c);
    setBusy(false);
  }

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl text-lg text-white" style={{ background: color }}>
        {glyph}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{label}</div>
        <div className="truncate text-xs text-[var(--muted)]">{description}</div>
      </div>
      <button
        onClick={toggle}
        disabled={busy}
        className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium ${
          isConnected ? "bg-emerald-100 text-emerald-700" : "bg-nebula-600 text-white"
        }`}
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : isConnected ? <Check size={14} /> : <Plus size={14} />}
        {isConnected ? "Connected" : "Connect"}
      </button>
    </div>
  );
}
