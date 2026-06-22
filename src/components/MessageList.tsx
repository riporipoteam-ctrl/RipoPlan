"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Agent, Message, Profile, Rank } from "@/lib/types";
import { fetchRanks, rankMapById } from "@/lib/ranks";
import { RankBadge } from "./RankBadge";
import { AgentAvatar, UserAvatar } from "./Avatar";
import { Markdown } from "./Markdown";
import { clockTime } from "@/lib/format";
import Link from "next/link";
import { Activity as ActivityIcon, ChevronRight, Check, Loader2, X, Search, Globe, Code2, FileText, Copy, Boxes } from "lucide-react";
import { AgentAvatar as AvatarBox } from "./Avatar";

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1400);
        } catch {}
      }}
      className="flex items-center gap-1 text-xs text-[var(--muted)] opacity-0 transition group-hover:opacity-100 hover:text-nebula-600"
      aria-label="Copy message"
    >
      {done ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
      {done ? "Copied" : "Copy"}
    </button>
  );
}

function Attachments({ items }: { items: any[] }) {
  const cards = items.filter((a) => a?.type === "agent_created");
  const media = items.filter((a) => a?.type === "image" || a?.type === "file");
  const miniApps = items.filter((a) => a?.type === "mini_app");
  return (
    <>
      {miniApps.map((a, i) => (
        <Link key={`app-${i}`} href="/mini-apps" className="mt-2 flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-2.5 hover:border-nebula-400">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-nebula-100 text-nebula-600">
            <Boxes size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold leading-tight">{a.name}</div>
            <div className="text-xs text-emerald-600">Published to Mini Apps · tap to open</div>
          </div>
          <Arrow size={16} className="text-[var(--muted)]" />
        </Link>
      ))}
      {media.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-2">
          {media.map((a, i) =>
            a.type === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <a key={i} href={a.url} target="_blank" rel="noreferrer">
                <img src={a.url} alt={a.name} className="max-h-48 rounded-xl border border-[var(--border)] object-cover" />
              </a>
            ) : (
              <a key={i} href={a.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs hover:bg-black/5">
                <FileText size={14} /> {a.name}
              </a>
            )
          )}
        </div>
      )}
      {cards.map((c, i) => (
        <Link key={i} href={`/agent?id=${c.id}`} className="mt-2 flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-2.5 hover:border-nebula-400">
          <AvatarBox emoji={c.emoji} color={c.color} size={36} />
          <div className="min-w-0 flex-1">
            <div className="font-semibold leading-tight">{c.name}</div>
            <div className="text-xs text-emerald-600">Created{c.role ? ` · ${c.role}` : ""}</div>
          </div>
          <Arrow size={16} className="text-[var(--muted)]" />
        </Link>
      ))}
    </>
  );
}

function Arrow({ size, className }: { size: number; className?: string }) {
  return <ChevronRight size={size} className={className} />;
}

function toolIcon(tool?: string) {
  if (tool === "web_search") return Search;
  if (tool === "browse") return Globe;
  if (tool === "code") return Code2;
  return ActivityIcon;
}

function ActivityTrail({ activities }: { activities: Message["activities"] }) {
  const [open, setOpen] = useState(false);
  if (!activities?.length) return null;
  return (
    <div className="mb-1">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
        <ActivityIcon size={13} />
        {activities.length} {activities.length === 1 ? "activity" : "activities"}
        <span className="opacity-50">·</span>
        <span className="text-nebula-600">{open ? "hide" : "view activity"}</span>
        <ChevronRight size={12} className={open ? "rotate-90 transition" : "transition"} />
      </button>
      {open && (
        <div className="mt-1.5 space-y-1 rounded-lg border border-[var(--border)] bg-black/[0.02] p-2 dark:bg-white/[0.03]">
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

function Thinking({ activities, onCancel }: { activities: Message["activities"]; onCancel?: () => void }) {
  const latest = activities && activities.length ? activities[activities.length - 1] : null;
  const Icon = toolIcon(latest?.tool);
  return (
    <div className="py-0.5">
      <div className="text-sm font-medium text-[var(--muted)]">Thinking…</div>
      {latest && (
        <div className="mt-1 flex items-center gap-1.5 text-xs text-[var(--muted)]">
          <Icon size={13} className="text-nebula-500" />
          <span className="truncate">{latest.label}</span>
        </div>
      )}
      <div className="mt-1.5 flex items-center gap-3">
        <span className="flex gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-nebula-pink animate-pulse-dot" />
          <span className="h-1.5 w-1.5 rounded-full bg-nebula-pink animate-pulse-dot [animation-delay:0.2s]" />
          <span className="h-1.5 w-1.5 rounded-full bg-nebula-pink animate-pulse-dot [animation-delay:0.4s]" />
        </span>
        {onCancel && (
          <button onClick={onCancel} className="text-xs text-nebula-600">
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

function stripMentions(text: string, agents: Agent[]): string {
  if (!text) return text;
  const tokens = new Set<string>();
  for (const a of agents) {
    if (a.handle) tokens.add(a.handle.toLowerCase());
    tokens.add(a.name.toLowerCase().replace(/\s+/g, "-"));
    tokens.add(a.name.toLowerCase().replace(/\s+/g, ""));
  }
  let out = text.replace(/@([a-z0-9_-]+)/gi, (m, t) => (tokens.has(String(t).toLowerCase()) ? "" : m));
  out = out
    .replace(/\[\s*\]/g, "")
    .replace(/\(\s*\)/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/^[ \t]*[:,–-]\s*/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return out;
}

function MessageItem({
  m,
  agents,
  ranks,
  profile,
  onCancel,
}: {
  m: Message;
  agents: Map<string, Agent>;
  ranks: Map<string, Rank>;
  profile: Profile;
  onCancel: (id: string) => void;
}) {
  const isAgent = m.sender_type === "agent";
  const agent = m.agent_id ? agents.get(m.agent_id) : undefined;
  const rank = isAgent && agent?.rank_id ? ranks.get(agent.rank_id) : null;
  const name = isAgent ? agent?.name || "Agent" : profile.display_name || "You";
  const raw = m.content || "";
  const display = isAgent ? stripMentions(raw, Array.from(agents.values())) || raw : raw;

  return (
    <div className="group flex gap-3 animate-fade-in-up">
      {isAgent ? (
        <AgentAvatar emoji={agent?.emoji} color={agent?.avatar_color} imageUrl={agent?.avatar_url} size={30} withDot />
      ) : (
        <UserAvatar name={profile.display_name} color={profile.avatar_color} size={30} />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-bold">{name}</span>
          {rank && <RankBadge rank={rank} />}
          <span className="text-xs text-[var(--muted)]">{clockTime(m.created_at)}</span>
          {isAgent && m.status !== "thinking" && display && (
            <span className="ml-auto"><CopyButton text={display} /></span>
          )}
        </div>
        <div className="mt-0.5">
          {m.status === "thinking" ? (
            <Thinking activities={m.activities} onCancel={() => onCancel(m.id)} />
          ) : (
            <>
              {isAgent && <ActivityTrail activities={m.activities} />}
              {display && <Markdown>{display}</Markdown>}
              {m.attachments && m.attachments.length > 0 && <Attachments items={m.attachments} />}
            </>
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
  const [agentList, setAgentList] = useState<Agent[]>(agents);
  const [ranks, setRanks] = useState<Map<string, Rank>>(new Map());
  const agentMap = new Map(agentList.map((a) => [a.id, a]));
  const bottomRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  const workspaceId = agents[0]?.workspace_id;
  useEffect(() => {
    if (!workspaceId) return;
    fetchRanks(supabase, workspaceId).then((r) => setRanks(rankMapById(r)));
  }, [workspaceId, supabase]);

  useEffect(() => setAgentList((prev) => {
    const ids = new Set(prev.map((a) => a.id));
    const merged = [...prev];
    for (const a of agents) if (!ids.has(a.id)) merged.push(a);
    return merged;
  }), [agents]);

  // Resolve any agents referenced by messages that we don't have yet (e.g. just-created ones)
  useEffect(() => {
    const known = new Set(agentList.map((a) => a.id));
    const missing = Array.from(
      new Set(messages.filter((m) => m.agent_id && !known.has(m.agent_id)).map((m) => m.agent_id as string))
    );
    if (!missing.length) return;
    supabase
      .from("agents")
      .select("*")
      .in("id", missing)
      .then(({ data }) => {
        if (data && data.length) {
          setAgentList((prev) => {
            const ids = new Set(prev.map((a) => a.id));
            return [...prev, ...(data as Agent[]).filter((a) => !ids.has(a.id))];
          });
        }
      });
  }, [messages, agentList, supabase]);

  const fetchMessages = useCallback(async () => {
    let q = supabase.from("messages").select("*").order("created_at", { ascending: true });
    if (threadId) q = q.eq("thread_id", threadId);
    else if (channelId) q = q.eq("channel_id", channelId).is("thread_id", null);
    const { data } = await q;
    if (data) setMessages(data as Message[]);
  }, [supabase, threadId, channelId]);

  async function cancel(id: string) {
    setMessages((prev) => prev.filter((m) => m.id !== id));
    await supabase.from("messages").delete().eq("id", id);
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Realtime for instant updates …
  useEffect(() => {
    const filter = threadId ? `thread_id=eq.${threadId}` : `channel_id=eq.${channelId}`;
    const channel = supabase
      .channel(`msgs-${threadId || channelId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter }, (payload) => {
        const row = payload.new as Message;
        if (payload.eventType === "DELETE") {
          setMessages((prev) => prev.filter((x) => x.id !== (payload.old as any).id));
          return;
        }
        if (channelId && !threadId && row.thread_id) return; // channel root only
        setMessages((prev) => {
          const idx = prev.findIndex((x) => x.id === row.id);
          if (idx === -1) return [...prev, row];
          const copy = [...prev];
          copy[idx] = row;
          return copy;
        });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, channelId]);

  // … plus a polling fallback so updates always appear even if realtime drops.
  useEffect(() => {
    const id = setInterval(() => {
      const working = messages.some((m) => m.status === "thinking" || m.status === "streaming");
      if (working) fetchMessages();
    }, 2000);
    return () => clearInterval(id);
  }, [messages, fetchMessages]);

  return (
    <div className="space-y-5">
      {messages.map((m) => (
        <MessageItem key={m.id} m={m} agents={agentMap} ranks={ranks} profile={profile} onCancel={cancel} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
