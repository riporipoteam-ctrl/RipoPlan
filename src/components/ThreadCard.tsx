"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";
import type { Agent, Thread } from "@/lib/types";
import { AgentAvatar, UserAvatar } from "./Avatar";
import { relativeTime } from "@/lib/format";

export function ThreadCard({
  thread,
  agent,
  userName,
  userColor,
  badge,
  onRename,
  onDelete,
}: {
  thread: Thread;
  agent?: Agent;
  userName?: string | null;
  userColor?: string | null;
  badge?: number;
  onRename?: (t: Thread) => void;
  onDelete?: (t: Thread) => void;
}) {
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const hasMenu = onRename || onDelete;

  return (
    <div
      onClick={() => router.push(`/thread?id=${thread.id}`)}
      className="group relative cursor-pointer rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 transition-colors hover:border-nebula-400/60"
    >
      <div className="flex items-center gap-2">
        <div className="flex -space-x-1.5">
          <UserAvatar name={userName} color={userColor} size={20} />
          {agent && <AgentAvatar emoji={agent.emoji} color={agent.avatar_color} imageUrl={agent.avatar_url} size={20} />}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold leading-tight">{thread.title || "Untitled thread"}</h3>
          {thread.summary && <p className="truncate text-xs text-[var(--muted)]">{thread.summary}</p>}
        </div>
        <span className="shrink-0 text-[11px] text-[var(--muted)]">{relativeTime(thread.last_activity_at)}</span>
        {badge ? (
          <span className="flex h-4 min-w-4 items-center justify-center rounded bg-nebula-pink px-1 text-[10px] font-bold text-white">{badge}</span>
        ) : null}
        {hasMenu && (
          <button
            onClick={(e) => { e.stopPropagation(); setMenu((m) => !m); }}
            className="rounded-md p-1 text-[var(--muted)] opacity-0 transition hover:bg-black/10 group-hover:opacity-100"
            aria-label="Thread options"
          >
            <MoreVertical size={15} />
          </button>
        )}
      </div>

      {menu && hasMenu && (
        <>
          <div className="fixed inset-0 z-20" onClick={(e) => { e.stopPropagation(); setMenu(false); }} />
          <div className="absolute right-2 top-9 z-30 w-32 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-lg">
            {onRename && (
              <button onClick={(e) => { e.stopPropagation(); setMenu(false); onRename(thread); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-black/5">
                <Pencil size={14} /> Rename
              </button>
            )}
            {onDelete && (
              <button onClick={(e) => { e.stopPropagation(); setMenu(false); onDelete(thread); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-500 hover:bg-black/5">
                <Trash2 size={14} /> Delete
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
