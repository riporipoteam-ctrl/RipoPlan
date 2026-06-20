"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MessageSquare, Pause, Play, Trash2, Loader2 } from "lucide-react";
import type { Agent } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/lib/session";
import { openAgentDM, updateAgent, archiveAgent } from "@/lib/actions";

export function AgentActions({ agent }: { agent: Agent }) {
  const router = useRouter();
  const supabase = createClient();
  const { ctx } = useSession();
  const [status, setStatus] = useState(agent.status);
  const [busy, setBusy] = useState<string | null>(null);

  async function openChat() {
    if (!ctx) return;
    setBusy("chat");
    const id = await openAgentDM(supabase, ctx, agent.id);
    if (id) router.push(`/thread?id=${id}`);
    setBusy(null);
  }

  async function toggle() {
    if (!ctx) return;
    setBusy("toggle");
    const next = status === "active" ? "paused" : "active";
    await updateAgent(supabase, ctx, agent.id, { status: next });
    setStatus(next);
    setBusy(null);
  }

  async function remove() {
    if (!ctx || !confirm(`Archive ${agent.name}?`)) return;
    setBusy("delete");
    await archiveAgent(supabase, ctx, agent.id);
    router.push("/agents");
  }

  return (
    <div className="flex gap-2">
      <button
        onClick={openChat}
        disabled={!!busy}
        className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-nebula-600 to-nebula-pink py-2.5 text-sm font-semibold text-white disabled:opacity-60"
      >
        {busy === "chat" ? <Loader2 size={16} className="animate-spin" /> : <MessageSquare size={16} />}
        Message
      </button>
      <button
        onClick={toggle}
        disabled={!!busy}
        className="flex items-center justify-center gap-2 rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-medium"
      >
        {busy === "toggle" ? (
          <Loader2 size={16} className="animate-spin" />
        ) : status === "active" ? (
          <Pause size={16} />
        ) : (
          <Play size={16} />
        )}
        {status === "active" ? "Pause" : "Resume"}
      </button>
      <button
        onClick={remove}
        disabled={!!busy}
        className="flex items-center justify-center rounded-xl border border-[var(--border)] px-3 py-2.5 text-red-500"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}
