"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/lib/session";
import { TopBar } from "@/components/TopBar";
import { Composer } from "@/components/Composer";
import { ThreadCard } from "@/components/ThreadCard";
import type { Agent, Thread } from "@/lib/types";

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Working late";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export default function HomePage() {
  const supabase = createClient();
  const { ctx } = useSession();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [participants, setParticipants] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);

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
      // Map each thread → ordered unique list of agent ids that spoke in it.
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

  const agentMap = new Map(agents.map((a) => [a.id, a]));

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

  return (
    <>
      <TopBar title="Home" profileName={ctx?.profile.display_name} profileColor={ctx?.profile.avatar_color} />
      <div className="flex-1 space-y-5 px-4 py-4">
        {/* Hero greeting */}
        <div className="animate-fade-in-up overflow-hidden rounded-3xl border border-[var(--border)] bg-gradient-to-br from-[color-mix(in_srgb,var(--accent)_16%,var(--card))] via-[var(--card)] to-[color-mix(in_srgb,var(--accent-2)_12%,var(--card))] p-5">
          <h1 className="text-2xl font-extrabold tracking-tight">
            {greeting()}{ctx?.profile.display_name ? `, ${ctx.profile.display_name.split(" ")[0]}` : ""}
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Your team of <span className="font-semibold text-[var(--text)]">{agents.length}</span> AI agents is ready. Describe a goal and they'll get to work.
          </p>
          <div className="mt-4">
            <Composer mode="start" agents={agents} />
          </div>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between px-1">
            <h2 className="font-bold">Threads</h2>
            <button className="flex items-center gap-1 text-sm text-[var(--muted)]">
              My stuff <ChevronDown size={14} />
            </button>
          </div>
          {loading ? (
            <div className="flex justify-center py-10 text-[var(--muted)]"><Loader2 className="animate-spin" /></div>
          ) : (
            <div className="stagger space-y-2.5">
              {threads.length === 0 && (
                <p className="rounded-2xl border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--muted)]">
                  No threads yet. Describe a goal above and your agents will get to work.
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
          )}
        </div>
      </div>
    </>
  );
}
