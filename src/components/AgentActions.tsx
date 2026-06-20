"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MessageSquare, Pause, Play, Trash2, Loader2 } from "lucide-react";
import type { Agent } from "@/lib/types";

export function AgentActions({ agent }: { agent: Agent }) {
  const router = useRouter();
  const [status, setStatus] = useState(agent.status);
  const [busy, setBusy] = useState<string | null>(null);

  async function openChat() {
    setBusy("chat");
    const res = await fetch(`/api/agents/${agent.id}/dm`, { method: "POST" });
    const data = await res.json();
    if (data.threadId) router.push(`/threads/${data.threadId}`);
    setBusy(null);
  }

  async function toggle() {
    setBusy("toggle");
    const next = status === "active" ? "paused" : "active";
    await fetch(`/api/agents/${agent.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setStatus(next);
    setBusy(null);
    router.refresh();
  }

  async function remove() {
    if (!confirm(`Archive ${agent.name}?`)) return;
    setBusy("delete");
    await fetch(`/api/agents/${agent.id}`, { method: "DELETE" });
    router.push("/agents");
    router.refresh();
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
