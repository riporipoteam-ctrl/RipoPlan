"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/lib/session";
import { TopBar } from "@/components/TopBar";
import { MessageList } from "@/components/MessageList";
import { Composer } from "@/components/Composer";
import type { Agent, Message, Thread } from "@/lib/types";

function ThreadView() {
  const supabase = createClient();
  const { ctx } = useSession();
  const id = useSearchParams().get("id") || "";
  const [thread, setThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ctx || !id) return;
    let active = true;
    (async () => {
      const [{ data: th }, { data: msgs }, { data: ag }] = await Promise.all([
        supabase.from("threads").select("*").eq("id", id).maybeSingle(),
        supabase.from("messages").select("*").eq("thread_id", id).order("created_at"),
        supabase.from("agents").select("*").eq("workspace_id", ctx.workspace.id),
      ]);
      if (!active) return;
      setThread(th as Thread);
      setMessages((msgs as Message[]) || []);
      setAgents((ag as Agent[]) || []);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx?.workspace.id, id]);

  const primary = agents.find((a) => a.id === thread?.primary_agent_id);

  if (loading || !ctx) {
    return (
      <div className="flex flex-1 items-center justify-center text-[var(--muted)]">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  return (
    <>
      <TopBar
        title={thread?.title || "Thread"}
        subtitle={primary ? `${primary.name} · ${primary.role}` : undefined}
        back="/home"
      />
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <MessageList key={id} initial={messages} agents={agents} profile={ctx.profile} threadId={id} />
      </div>
      <div className="sticky bottom-0 border-t border-[var(--border)] bg-[var(--bg)] px-4 py-3">
        <Composer mode="thread" threadId={id} agents={agents} placeholder="Reply to the thread…" />
      </div>
    </>
  );
}

export default function ThreadPage() {
  return (
    <Suspense fallback={<div className="flex flex-1 items-center justify-center text-[var(--muted)]"><Loader2 className="animate-spin" /></div>}>
      <ThreadView />
    </Suspense>
  );
}
