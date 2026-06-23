"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/lib/session";
import { TopBar } from "@/components/TopBar";
import { MessageList } from "@/components/MessageList";
import { Composer } from "@/components/Composer";
import type { Agent, Channel, Message } from "@/lib/types";

function ChannelView() {
  const supabase = createClient();
  const { ctx } = useSession();
  const id = useSearchParams().get("id") || "";
  const [channel, setChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ctx || !id) return;
    let active = true;
    (async () => {
      const [{ data: ch }, { data: msgs }, { data: ag }] = await Promise.all([
        supabase.from("channels").select("*").eq("id", id).maybeSingle(),
        supabase.from("messages").select("*").eq("channel_id", id).is("thread_id", null).order("created_at"),
        supabase.from("agents").select("*").eq("workspace_id", ctx.workspace.id),
      ]);
      if (!active) return;
      setChannel(ch as Channel);
      setMessages((msgs as Message[]) || []);
      setAgents((ag as Agent[]) || []);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx?.workspace.id, id]);

  if (loading || !ctx) {
    return <div className="flex flex-1 items-center justify-center text-[var(--muted)]"><Loader2 className="animate-spin" /></div>;
  }

  return (
    <>
      <TopBar title={`#${channel?.name || ""}`} subtitle={channel?.description || undefined} back="/channels" />
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <p className="rounded-2xl border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--muted)]">
            This is the start of #{channel?.name}. Mention an agent like <b>@askai</b> to get help here.
          </p>
        )}
        <MessageList key={id} initial={messages} agents={agents} profile={ctx.profile} channelId={id} />
      </div>
      <div className="sticky bottom-0 border-t border-[var(--border)] bg-[var(--bg)] px-4 py-3">
        <Composer mode="channel" channelId={id} agents={agents} placeholder={`Message #${channel?.name || ""}`} />
      </div>
    </>
  );
}

export default function ChannelPage() {
  return (
    <Suspense fallback={<div className="flex flex-1 items-center justify-center text-[var(--muted)]"><Loader2 className="animate-spin" /></div>}>
      <ChannelView />
    </Suspense>
  );
}
