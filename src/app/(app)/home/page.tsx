"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Loader2, Trophy, Image as ImageIcon, Globe, Search, PenLine, Bot } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/lib/session";
import { TopBar } from "@/components/TopBar";
import { Composer } from "@/components/Composer";
import { ThreadCard } from "@/components/ThreadCard";
import { haptic } from "@/lib/native";
import type { Agent, Thread } from "@/lib/types";

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Working late";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

// ChatGPT-style starter suggestions. Tapping one seeds the composer.
const SUGGESTIONS = [
  { icon: Trophy, label: "Follow the World Cup", text: "Give me a live World Cup update — recent results, today's fixtures, and the current standings.", tint: "#f59e0b" },
  { icon: ImageIcon, label: "Create an image", text: "Create an image of ", tint: "#ec4899" },
  { icon: Globe, label: "Build me a website", text: "Build me a website for ", tint: "#6366f1" },
  { icon: Search, label: "Research a topic", text: "Research and summarize the latest on ", tint: "#10b981" },
  { icon: PenLine, label: "Write or edit", text: "Help me write ", tint: "#a855f7" },
  { icon: Bot, label: "Make a new agent", text: "Make a new agent called ", tint: "#0ea5e9" },
];

export default function HomePage() {
  const supabase = createClient();
  const { ctx } = useSession();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [participants, setParticipants] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [showThreads, setShowThreads] = useState(false);
  const [preset, setPreset] = useState<{ text: string; nonce: number }>({ text: "", nonce: 0 });

  useEffect(() => {
    if (!ctx) return;
    let active = true;
    async function load() {
      const [{ data: a }, { data: t }, { data: msgs }] = await Promise.all([
        supabase.from("agents").select("*").eq("workspace_id", ctx!.workspace.id).neq("status", "archived").order("created_at"),
        supabase.from("threads").select("*").eq("workspace_id", ctx!.workspace.id).order("last_activity_at", { ascending: false }).limit(50),
        supabase.from("messages").select("thread_id,agent_id").eq("workspace_id", ctx!.workspace.id).eq("sender_type", "agent").not("thread_id", "is", null).not("agent_id", "is", null).order("created_at", { ascending: false }).limit(600),
      ]);
      if (!active) return;
      const byThread: Record<string, string[]> = {};
      for (const m of (msgs as any[]) || []) {
        const arr = (byThread[m.thread_id] ||= []);
        if (!arr.includes(m.agent_id)) arr.push(m.agent_id);
      }
      setParticipants(byThread);
      setAgents((a as Agent[]) || []);
      setThreads((t as Thread[]) || []);
      setLoading(false);
    }
    load();
    const ch = supabase
      .channel(`home-${ctx.workspace.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "threads", filter: `workspace_id=eq.${ctx.workspace.id}` }, load)
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx?.workspace.id]);

  const agentMap = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);

  function seed(text: string) {
    haptic("light");
    setPreset((p) => ({ text, nonce: p.nonce + 1 }));
  }

  async function renameThread(t: Thread) {
    const title = window.prompt("Rename thread", t.title || "")?.trim();
    if (!title) return;
    setThreads((list) => list.map((x) => (x.id === t.id ? { ...x, title } : x)));
    await supabase.from("threads").update({ title }).eq("id", t.id);
  }

  async function deleteThread(t: Thread) {
    if (!window.confirm("Delete this thread and its messages?")) return;
    setThreads((list) => list.filter((x) => x.id !== t.id));
    await supabase.from("threads").delete().eq("id", t.id);
  }

  const firstName = ctx?.profile.display_name ? ctx.profile.display_name.split(" ")[0] : "";

  return (
    <>
      <TopBar title="New chat" profileName={ctx?.profile.display_name} profileColor={ctx?.profile.avatar_color} />

      <div className="relative flex flex-1 flex-col px-4">
        {/* Ambient gradient glow behind the hero */}
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-[radial-gradient(60%_70%_at_50%_0%,color-mix(in_srgb,var(--accent)_18%,transparent),transparent_70%)]" />

        {/* Centered new-chat hero (ChatGPT-style) */}
        <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center py-6">
          <div className="animate-fade-in-up flex flex-col items-center text-center">
            <div className="mb-4 grid h-16 w-16 place-items-center rounded-3xl glass-ios animate-float shadow-[0_18px_50px_-18px_color-mix(in_srgb,var(--accent)_70%,transparent)]">
              <Spark />
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight">
              {greeting()}{firstName ? `, ${firstName}` : ""}
            </h1>
            <p className="mt-2 max-w-md text-[15px] text-[var(--muted)]">
              What can your team of <span className="font-semibold text-[var(--text)]">{agents.length || "—"}</span> AI agents get done for you today?
            </p>
          </div>

          {/* Composer */}
          <div className="mt-6">
            <Composer mode="start" agents={agents} presetText={preset.text} presetNonce={preset.nonce} placeholder="Message your agents…" />
          </div>

          {/* Suggestion chips */}
          <div className="mt-4 flex flex-wrap justify-center gap-2 stagger">
            {SUGGESTIONS.map((s) => {
              const Icon = s.icon;
              return (
                <button
                  key={s.label}
                  onClick={() => seed(s.text)}
                  className="pressable hover-glow flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--card)] px-3.5 py-2 text-sm font-medium"
                >
                  <Icon size={16} style={{ color: s.tint }} />
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Recent threads — collapsible, secondary to the new chat */}
        <div className="mx-auto mb-4 w-full max-w-2xl">
          <button
            onClick={() => { setShowThreads((v) => !v); haptic("light"); }}
            className="mb-2 flex w-full items-center justify-between px-1 text-left"
          >
            <h2 className="font-bold">Recent chats {threads.length > 0 && <span className="text-[var(--muted)]">· {threads.length}</span>}</h2>
            <ChevronDown size={16} className={`text-[var(--muted)] transition-transform ${showThreads ? "rotate-180" : ""}`} />
          </button>

          {showThreads && (
            loading ? (
              <div className="flex justify-center py-8 text-[var(--muted)]"><Loader2 className="animate-spin" /></div>
            ) : (
              <div className="stagger space-y-2.5 animate-fade-in">
                {threads.length === 0 && (
                  <p className="rounded-2xl border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--muted)]">
                    No chats yet. Describe a goal above and your agents will get to work.
                  </p>
                )}
                {threads.map((t) => (
                  <ThreadCard
                    key={t.id}
                    thread={t}
                    agent={t.primary_agent_id ? agentMap.get(t.primary_agent_id) : undefined}
                    participants={(participants[t.id] || []).map((id) => agentMap.get(id)).filter(Boolean) as Agent[]}
                    userName={ctx?.profile.display_name}
                    userColor={ctx?.profile.avatar_color}
                    onRename={renameThread}
                    onDelete={deleteThread}
                  />
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </>
  );
}

function Spark() {
  return (
    <svg width="34" height="34" viewBox="0 0 1024 1024" aria-hidden>
      <defs>
        <linearGradient id="home-sx" x1="0.15" y1="0.05" x2="0.9" y2="1">
          <stop offset="0" stopColor="#b06bff" />
          <stop offset="0.5" stopColor="#8b5cf6" />
          <stop offset="1" stopColor="#ff5ea8" />
        </linearGradient>
      </defs>
      <path d="M512 250 C 540 405, 607 472, 762 500 C 607 528, 540 595, 512 750 C 484 595, 417 528, 262 500 C 417 472, 484 405, 512 250 Z" fill="url(#home-sx)" />
      <path d="M724 312 C 734 360, 758 384, 806 394 C 758 404, 734 428, 724 476 C 714 428, 690 404, 642 394 C 690 384, 714 360, 724 312 Z" fill="url(#home-sx)" opacity="0.9" />
    </svg>
  );
}
