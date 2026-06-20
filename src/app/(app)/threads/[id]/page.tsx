import { notFound, redirect } from "next/navigation";
import { getAgents, getMessagesForThread, getSessionContext, getThread } from "@/lib/data";
import { TopBar } from "@/components/TopBar";
import { MessageList } from "@/components/MessageList";
import { Composer } from "@/components/Composer";

export const dynamic = "force-dynamic";

export default async function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getSessionContext();
  if (!ctx?.workspace) redirect("/login");

  const thread = await getThread(id);
  if (!thread) notFound();

  const [messages, agents] = await Promise.all([
    getMessagesForThread(id),
    getAgents(ctx.workspace.id),
  ]);
  const primary = agents.find((a) => a.id === thread.primary_agent_id);

  return (
    <>
      <TopBar
        title={thread.title || "Thread"}
        subtitle={primary ? `${primary.name} · ${primary.role}` : undefined}
        back="/home"
      />
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <MessageList initial={messages} agents={agents} profile={ctx.profile} threadId={id} />
      </div>
      <div className="sticky bottom-0 border-t border-[var(--border)] bg-[var(--bg)] px-4 py-3">
        <Composer mode="thread" threadId={id} agents={agents} placeholder="Reply to the thread…" />
      </div>
    </>
  );
}
