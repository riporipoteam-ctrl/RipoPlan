"use client";

import { useEffect, useState } from "react";
import { Loader2, Brain, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/lib/session";
import { TopBar } from "@/components/TopBar";
import { KnowledgeManager } from "@/components/KnowledgeManager";
import { relativeTime } from "@/lib/format";

export default function KnowledgePage() {
  const supabase = createClient();
  const { ctx } = useSession();
  const [items, setItems] = useState<any[] | null>(null);
  const [memories, setMemories] = useState<any[]>([]);
  const [agentNames, setAgentNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!ctx) return;
    supabase
      .from("knowledge")
      .select("id,title,content")
      .eq("workspace_id", ctx.workspace.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => setItems(data || []));
    supabase
      .from("agent_memories")
      .select("id,content,agent_id,created_at")
      .eq("workspace_id", ctx.workspace.id)
      .order("created_at", { ascending: false })
      .limit(200)
      .then(({ data }) => setMemories(data || []));
    supabase
      .from("agents")
      .select("id,name")
      .eq("workspace_id", ctx.workspace.id)
      .then(({ data }) => setAgentNames(Object.fromEntries(((data as any[]) || []).map((a) => [a.id, a.name]))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx?.workspace.id]);

  async function forget(id: string) {
    setMemories((m) => m.filter((x) => x.id !== id));
    await supabase.from("agent_memories").delete().eq("id", id);
  }

  return (
    <>
      <TopBar title="Knowledge" subtitle="Shared context & agent memory" back="/settings" />
      <div className="flex-1 space-y-6 px-4 py-4">
        {items === null ? (
          <div className="flex justify-center py-10 text-[var(--muted)]"><Loader2 className="animate-spin" /></div>
        ) : (
          <KnowledgeManager initial={items} />
        )}

        <div>
          <div className="mb-2 flex items-center gap-2 px-1">
            <Brain size={16} className="text-nebula-600" />
            <h2 className="text-sm font-semibold">Agent memory</h2>
            <span className="text-xs text-[var(--muted)]">{memories.length}</span>
          </div>
          {memories.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-[var(--border)] p-5 text-center text-sm text-[var(--muted)]">
              Nothing remembered yet. As you chat, your agents save key facts here and recall them across every conversation.
            </p>
          ) : (
            <div className="space-y-2">
              {memories.map((m) => (
                <div key={m.id} className="group flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 animate-fade-in-up">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{m.content}</p>
                    <p className="mt-0.5 text-xs text-[var(--muted)]">{agentNames[m.agent_id] || "Agent"} · {relativeTime(m.created_at)}</p>
                  </div>
                  <button onClick={() => forget(m.id)} className="rounded-md p-1 text-[var(--muted)] opacity-0 transition hover:text-red-500 group-hover:opacity-100" aria-label="Forget">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
