"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Play, Loader2, Clock } from "lucide-react";
import type { Agent, Job } from "@/lib/types";
import { AgentAvatar } from "./Avatar";
import { relativeTime } from "@/lib/format";

export function JobRow({ job, agent }: { job: Job; agent?: Agent }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(job.enabled);
  const [running, setRunning] = useState(false);

  async function toggle() {
    const next = !enabled;
    setEnabled(next);
    await fetch(`/api/jobs/${job.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: next }),
    });
  }

  async function runNow() {
    setRunning(true);
    const res = await fetch(`/api/jobs/${job.id}`, { method: "POST" });
    const data = await res.json();
    setRunning(false);
    if (data.threadId) router.push(`/threads/${data.threadId}`);
    else router.refresh();
  }

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3">
      <AgentAvatar emoji={agent?.emoji} color={agent?.avatar_color} size={40} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold">{job.name}</div>
        <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
          <Clock size={12} />
          <code>{job.schedule || "manual"}</code>
          {job.last_run_at && <span>· ran {relativeTime(job.last_run_at)}</span>}
        </div>
      </div>
      <button
        onClick={runNow}
        disabled={running}
        className="rounded-lg border border-[var(--border)] p-2 text-nebula-600"
        title="Run now"
      >
        {running ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
      </button>
      <button
        onClick={toggle}
        className={`relative h-6 w-10 rounded-full transition-colors ${enabled ? "bg-nebula-600" : "bg-[var(--border)]"}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${enabled ? "left-[18px]" : "left-0.5"}`}
        />
      </button>
    </div>
  );
}
