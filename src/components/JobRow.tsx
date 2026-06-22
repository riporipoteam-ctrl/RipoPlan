"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Play, Loader2, Clock } from "lucide-react";
import type { Agent, Job } from "@/lib/types";
import { AgentAvatar } from "./Avatar";
import { relativeTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/lib/session";
import { toggleJob, runJob } from "@/lib/actions";

export function JobRow({ job, agent }: { job: Job; agent?: Agent }) {
  const router = useRouter();
  const supabase = createClient();
  const { ctx } = useSession();
  const [enabled, setEnabled] = useState(job.enabled);
  const [running, setRunning] = useState(false);

  async function toggle() {
    if (!ctx) return;
    const next = !enabled;
    setEnabled(next);
    await toggleJob(supabase, ctx, job.id, next);
  }

  async function run() {
    if (!ctx) return;
    setRunning(true);
    const threadId = await runJob(supabase, ctx, job.id);
    setRunning(false);
    if (threadId) router.push(`/thread?id=${threadId}`);
  }

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3">
      <AgentAvatar emoji={agent?.emoji} color={agent?.avatar_color} imageUrl={agent?.avatar_url} size={40} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold">{job.name}</div>
        <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
          <Clock size={12} />
          <code>{job.schedule || "manual"}</code>
          {job.last_run_at && <span>· ran {relativeTime(job.last_run_at)}</span>}
        </div>
      </div>
      <button onClick={run} disabled={running} className="rounded-lg border border-[var(--border)] p-2 text-nebula-600" title="Run now">
        {running ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
      </button>
      <button
        onClick={toggle}
        className={`relative h-6 w-10 rounded-full transition-colors ${enabled ? "bg-nebula-600" : "bg-[var(--border)]"}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${enabled ? "left-[18px]" : "left-0.5"}`} />
      </button>
    </div>
  );
}
