import { redirect } from "next/navigation";
import { getAgents, getSessionContext, getThreads } from "@/lib/data";
import { TopBar } from "@/components/TopBar";
import { Composer } from "@/components/Composer";
import { ThreadCard } from "@/components/ThreadCard";
import { ChevronDown } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const ctx = await getSessionContext();
  if (!ctx?.workspace) redirect("/login");

  const [agents, threads] = await Promise.all([
    getAgents(ctx.workspace.id),
    getThreads(ctx.workspace.id),
  ]);
  const agentMap = new Map(agents.map((a) => [a.id, a]));

  return (
    <>
      <TopBar
        title="Home"
        profileName={ctx.profile.display_name}
        profileColor={ctx.profile.avatar_color}
        notifCount={2}
      />
      <div className="flex-1 space-y-5 px-4 py-4">
        <div>
          <p className="mb-2 px-1 text-sm text-[var(--muted)]">What should your agents do?</p>
          <Composer mode="start" agents={agents} />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between px-1">
            <h2 className="font-bold">Threads</h2>
            <button className="flex items-center gap-1 text-sm text-[var(--muted)]">
              My stuff <ChevronDown size={14} />
            </button>
          </div>
          <div className="space-y-3">
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
                userName={ctx.profile.display_name}
                userColor={ctx.profile.avatar_color}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
