import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAgents, getMessagesForChannel, getSessionContext } from "@/lib/data";
import { TopBar } from "@/components/TopBar";
import { MessageList } from "@/components/MessageList";
import { Composer } from "@/components/Composer";

export const dynamic = "force-dynamic";

export default async function ChannelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getSessionContext();
  if (!ctx?.workspace) redirect("/login");

  const supabase = await createClient();
  const { data: channel } = await supabase.from("channels").select("*").eq("id", id).maybeSingle();
  if (!channel) notFound();

  const [messages, agents] = await Promise.all([
    getMessagesForChannel(id),
    getAgents(ctx.workspace.id),
  ]);

  return (
    <>
      <TopBar title={`#${channel.name}`} subtitle={channel.description || undefined} back="/channels" />
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <p className="rounded-2xl border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--muted)]">
            This is the start of #{channel.name}. Mention an agent like <b>@nebula</b> to get help here.
          </p>
        )}
        <MessageList initial={messages} agents={agents} profile={ctx.profile} channelId={id} />
      </div>
      <div className="sticky bottom-0 border-t border-[var(--border)] bg-[var(--bg)] px-4 py-3">
        <Composer mode="channel" channelId={id} agents={agents} placeholder={`Message #${channel.name}`} />
      </div>
    </>
  );
}
