import Link from "next/link";
import type { Agent, Thread } from "@/lib/types";
import { AgentAvatar, UserAvatar } from "./Avatar";
import { relativeTime } from "@/lib/format";

export function ThreadCard({
  thread,
  agent,
  userName,
  userColor,
  badge,
}: {
  thread: Thread;
  agent?: Agent;
  userName?: string | null;
  userColor?: string | null;
  badge?: number;
}) {
  return (
    <Link
      href={`/thread?id=${thread.id}`}
      className="block rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 transition-colors hover:border-nebula-400/60"
    >
      <div className="mb-1.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-medium text-[var(--muted)]">
          <span className="h-2 w-2 rounded-full bg-nebula-500" />
          {agent?.name || "Agent"}
        </div>
        {badge ? (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-md bg-nebula-pink px-1 text-[11px] font-bold text-white">
            {badge}
          </span>
        ) : null}
      </div>
      <h3 className="mb-1 font-bold leading-snug">{thread.title || "Untitled thread"}</h3>
      {thread.summary && (
        <p className="line-clamp-2 text-sm text-[var(--muted)]">{thread.summary}</p>
      )}
      <div className="mt-3 flex items-center justify-between">
        <div className="flex -space-x-1.5">
          <UserAvatar name={userName} color={userColor} size={22} />
          {agent && (
            <AgentAvatar emoji={agent.emoji} color={agent.avatar_color} size={22} />
          )}
        </div>
        <span className="text-xs text-[var(--muted)]">{relativeTime(thread.last_activity_at)}</span>
      </div>
    </Link>
  );
}
