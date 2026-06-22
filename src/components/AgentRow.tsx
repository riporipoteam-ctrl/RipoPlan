import Link from "next/link";
import type { Agent } from "@/lib/types";
import { AgentAvatar } from "./Avatar";
import { relativeTime } from "@/lib/format";

export function AgentRow({ agent, preview }: { agent: Agent; preview?: string }) {
  const recent = agent.last_run_at && Date.now() - new Date(agent.last_run_at).getTime() < 10 * 60 * 1000;
  const time = agent.last_run_at || agent.created_at;
  return (
    <Link
      href={`/agent?id=${agent.id}`}
      className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3 transition-colors hover:bg-black/[0.02]"
    >
      <AgentAvatar emoji={agent.emoji} color={agent.avatar_color} imageUrl={agent.avatar_url} size={44} withDot={agent.status === "active"} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between">
          <span className="truncate font-bold">{agent.name}</span>
          <span className="ml-2 shrink-0 text-xs text-[var(--muted)]">{relativeTime(time)}</span>
        </div>
        <p className="truncate text-sm text-[var(--muted)]">
          {preview || agent.description || agent.role}
        </p>
      </div>
      {recent && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-blue-500" />}
    </Link>
  );
}
