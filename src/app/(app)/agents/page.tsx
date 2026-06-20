import Link from "next/link";
import { redirect } from "next/navigation";
import { getAgents, getSessionContext } from "@/lib/data";
import { TopBar } from "@/components/TopBar";
import { AgentRow } from "@/components/AgentRow";
import { Plus } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const ctx = await getSessionContext();
  if (!ctx?.workspace) redirect("/login");
  const agents = await getAgents(ctx.workspace.id);

  const previews: Record<string, string> = {
    nebula: "Welcome to your workspace! I'm your Chief of Staff.",
    writer: "I'm Writer — your go-to for any content that needs writing.",
    researcher: "Here's what's set up: your Researcher agent is ready.",
    builder: "Done. Here's what's running: workflows & automations.",
    "web-browser": "I browse the live web to find current information.",
  };

  return (
    <>
      <TopBar
        title="Agents"
        profileName={ctx.profile.display_name}
        profileColor={ctx.profile.avatar_color}
        notifCount={2}
        leading={
          <Link
            href="/agents/new"
            className="-ml-1 mr-1 flex h-7 w-7 items-center justify-center rounded-md text-[var(--muted)] hover:bg-black/5"
          >
            <Plus size={20} />
          </Link>
        }
      />
      <div className="flex items-center gap-2 px-4 py-3">
        <span className="rounded-full bg-nebula-100 px-3 py-1 text-sm font-medium text-nebula-700">
          My agents <span className="opacity-60">{agents.length}</span>
        </span>
        <span className="rounded-full border border-[var(--border)] px-3 py-1 text-sm text-[var(--muted)]">
          All agents <span className="opacity-60">{agents.length}</span>
        </span>
      </div>
      <div className="flex-1">
        {agents.map((a) => (
          <AgentRow key={a.id} agent={a} preview={previews[a.handle || ""]} />
        ))}
        <Link
          href="/agents/new"
          className="m-4 flex items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--border)] py-4 text-sm font-medium text-nebula-600 hover:bg-nebula-50"
        >
          <Plus size={18} /> Create a new agent
        </Link>
      </div>
    </>
  );
}
