"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Agent, Message, Profile } from "@/lib/types";
import { AgentAvatar, UserAvatar } from "./Avatar";
import { Markdown } from "./Markdown";
import { clockTime } from "@/lib/format";
import { Activity as ActivityIcon, ChevronRight, Check, Loader2, X } from "lucide-react";

function ActivityTrail({ activities, done }: { activities: Message["activities"]; done: boolean }) {
  const [open, setOpen] = useState(false);
  if (!activities?.length) return null;
  return (
    <div className="mb-1.5">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-xs text-[var(--muted)]"
      >
        <ActivityIcon size={13} />
        {activities.length} {activities.length === 1 ? "activity" : "activities"}
        <span className="opacity-50">·</span>
        <span className="text-nebula-600">{open ? "hide" : "view activity"}</span>
        <ChevronRight size={12} className={open ? "rotate-90 transition" : "transition"} />
      </button>
      {open && (
        <div className="mt-1.5 space-y-1 rounded-lg border border-[var(--border)] bg-black/[0.02] p-2">
          {activities.map((a, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              {a.status === "running" ? (
                <Loader2 size={12} className="mt-0.5 animate-spin text-nebula-500" />
              ) : a.status === "error" ? (
                <X size={12} className="mt-0.5 text-red-500" />
              ) : (
                <Check size={12} className="mt-0.5 text-emerald-500" />
              )}
              <div className="min-w-0">
                <div className="text-[var(--text)]">{a.label}</div>
                {a.detail && <div className="truncate text-[var(--muted)]">{a.detail}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MessageItem({
  m,
  agents,
  profile,
}: {
  m: Message;
  agents: Map<string, Agent>;
  profile: Profile;
}) {
  const isAgent = m.sender_type === "agent";
  const agent = m.agent_id ? agents.get(m.agent_id) : undefined;
  const name = isAgent ? agent?.name || "Agent" : profile.display_name || "You";

  return (
    <div className="flex gap-3 animate-fade-in">
      {isAgent ? (
        <AgentAvatar emoji={agent?.emoji} color={agent?.avatar_color} size={30} withDot />
      ) : (
        <UserAvatar name={profile.display_name} color={profile.avatar_color} size={30} />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-bold">{name}</span>
          <span className="text-xs text-[var(--muted)]">{clockTime(m.created_at)}</span>
        </div>
        <div className="mt-0.5">
          {isAgent && <ActivityTrail activities={m.activities} done={m.status === "complete"} />}
          {m.status === "thinking" && !m.content ? (
            <div className="flex items-center gap-2 py-1 text-sm text-[var(--muted)]">
              <span className="flex gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-nebula-pink animate-pulse-dot" />
                <span className="h-1.5 w-1.5 rounded-full bg-nebula-pink animate-pulse-dot [animation-delay:0.2s]" />
                <span className="h-1.5 w-1.5 rounded-full bg-nebula-pink animate-pulse-dot [animation-delay:0.4s]" />
              </span>
              <span className="text-nebula-600">Cancel</span>
            </div>
          ) : (
            m.content && <Markdown>{m.content}</Markdown>
          )}
        </div>
      </div>
    </div>
  );
}

export function MessageList({
  initial,
  agents,
  profile,
  threadId,
  channelId,
}: {
  initial: Message[];
  agents: Agent[];
  profile: Profile;
  threadId?: string;
  channelId?: string;
}) {
  const [messages, setMessages] = useState<Message[]>(initial);
  const agentMap = new Map(agents.map((a) => [a.id, a]));
  const bottomRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const filter = threadId ? `thread_id=eq.${threadId}` : `channel_id=eq.${channelId}`;
    const channel = supabase
      .channel(`msgs-${threadId || channelId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter },
        (payload) => {
          const row = payload.new as Message;
          if (channelId && !threadId && row.thread_id) return; // channel root only
          setMessages((prev) => {
            const idx = prev.findIndex((x) => x.id === row.id);
            if (idx === -1) return [...prev, row];
            const copy = [...prev];
            copy[idx] = row;
            return copy;
          });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, channelId]);

  return (
    <div className="space-y-5">
      {messages.map((m) => (
        <MessageItem key={m.id} m={m} agents={agentMap} profile={profile} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
