"use client";

import { useEffect, useState } from "react";
import { Plus, Loader2, Trash2, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/lib/session";
import { TopBar } from "@/components/TopBar";
import { AgentAvatar } from "@/components/Avatar";
import { RankBadge } from "@/components/RankBadge";
import { emojiFor, RANK_BADGES, RANK_COLORS } from "@/lib/emoji";
import { fetchRanks, ensureDefaultRank } from "@/lib/ranks";
import type { Agent, Rank } from "@/lib/types";

export default function RanksPage() {
  const supabase = createClient();
  const { ctx } = useSession();
  const [ranks, setRanks] = useState<Rank[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Rank | null>(null);

  async function load() {
    if (!ctx) return;
    await ensureDefaultRank(supabase, ctx.workspace.id, ctx.workspace.name);
    const [rks, { data }] = await Promise.all([
      fetchRanks(supabase, ctx.workspace.id),
      supabase.from("agents").select("*").eq("workspace_id", ctx.workspace.id).neq("status", "archived").order("created_at"),
    ]);
    setRanks(rks);
    setAgents((data as Agent[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx?.workspace.id]);

  async function createRank() {
    if (!ctx) return;
    const { data } = await supabase
      .from("ranks")
      .insert({
        workspace_id: ctx.workspace.id,
        name: "New Rank",
        color: RANK_COLORS[ranks.length % RANK_COLORS.length],
        badge: RANK_BADGES[ranks.length % RANK_BADGES.length],
        position: (ranks[ranks.length - 1]?.position ?? 100) + 10,
      })
      .select("*")
      .single();
    if (data) {
      setRanks((r) => [...r, data as Rank]);
      setEditing(data as Rank);
    }
  }

  async function saveRank(r: Rank) {
    await supabase.from("ranks").update({ name: r.name, color: r.color, badge: r.badge }).eq("id", r.id);
    setRanks((list) => list.map((x) => (x.id === r.id ? r : x)));
    setEditing(null);
  }

  async function deleteRank(r: Rank) {
    if (r.is_default) return;
    await supabase.from("ranks").delete().eq("id", r.id);
    setRanks((list) => list.filter((x) => x.id !== r.id));
    setAgents((list) => list.map((a) => (a.rank_id === r.id ? { ...a, rank_id: null } : a)));
  }

  async function assign(agent: Agent, rankId: string | null) {
    await supabase.from("agents").update({ rank_id: rankId }).eq("id", agent.id);
    setAgents((list) => list.map((a) => (a.id === agent.id ? { ...a, rank_id: rankId } : a)));
  }

  return (
    <>
      <TopBar title="Ranks" subtitle="Badges & hierarchy for your agents" back="/agents" />
      <div className="flex-1 space-y-5 px-4 py-4">
        {loading ? (
          <div className="flex justify-center py-10 text-[var(--muted)]"><Loader2 className="animate-spin" /></div>
        ) : (
          <>
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Ranks</h2>
                <button onClick={createRank} className="flex items-center gap-1 rounded-lg bg-nebula-600 px-2.5 py-1.5 text-xs font-medium text-white">
                  <Plus size={14} /> New rank
                </button>
              </div>
              {ranks.map((r) =>
                editing?.id === r.id ? (
                  <RankEditor key={r.id} rank={editing} onChange={setEditing} onSave={() => saveRank(editing)} onCancel={() => setEditing(null)} />
                ) : (
                  <div key={r.id} className="flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3">
                    <RankBadge rank={r} size="md" />
                    <span className="ml-auto text-xs text-[var(--muted)]">{agents.filter((a) => a.rank_id === r.id).length} agents</span>
                    <button onClick={() => setEditing(r)} className="rounded-lg px-2 py-1 text-xs font-medium text-nebula-600 hover:bg-black/5">Edit</button>
                    {!r.is_default && (
                      <button onClick={() => deleteRank(r)} className="rounded-lg p-1 text-[var(--muted)] hover:text-red-500"><Trash2 size={15} /></button>
                    )}
                  </div>
                )
              )}
            </section>

            <section className="space-y-2">
              <h2 className="text-sm font-semibold">Assign agents</h2>
              {agents.map((a) => (
                <div key={a.id} className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3">
                  <AgentAvatar emoji={a.emoji} color={a.avatar_color} imageUrl={a.avatar_url} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{a.name}</div>
                    <div className="truncate text-xs text-[var(--muted)]">{a.role}</div>
                  </div>
                  <select
                    value={a.rank_id || ""}
                    onChange={(e) => assign(a, e.target.value || null)}
                    className="rounded-lg border border-[var(--border)] bg-transparent px-2 py-1.5 text-xs outline-none"
                  >
                    <option value="">— No rank —</option>
                    {ranks.map((r) => (
                      <option key={r.id} value={r.id}>{emojiFor(r.badge)} {r.name}</option>
                    ))}
                  </select>
                </div>
              ))}
            </section>
          </>
        )}
      </div>
    </>
  );
}

function RankEditor({ rank, onChange, onSave, onCancel }: { rank: Rank; onChange: (r: Rank) => void; onSave: () => void; onCancel: () => void }) {
  return (
    <div className="space-y-3 rounded-2xl border border-nebula-300 bg-[var(--card)] p-3">
      <input
        value={rank.name}
        onChange={(e) => onChange({ ...rank, name: e.target.value })}
        placeholder="Rank name"
        className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-nebula-500"
      />
      <div>
        <div className="mb-1 text-xs text-[var(--muted)]">Badge</div>
        <div className="flex flex-wrap gap-1.5">
          {RANK_BADGES.map((b) => (
            <button key={b} onClick={() => onChange({ ...rank, badge: b })} className={`flex h-8 w-8 items-center justify-center rounded-lg border ${rank.badge === b ? "border-nebula-500 bg-nebula-50" : "border-[var(--border)]"}`}>
              {emojiFor(b)}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-1 text-xs text-[var(--muted)]">Color</div>
        <div className="flex flex-wrap gap-1.5">
          {RANK_COLORS.map((c) => (
            <button key={c} onClick={() => onChange({ ...rank, color: c })} className="h-8 w-8 rounded-lg ring-2 ring-offset-1 ring-offset-[var(--card)]" style={{ background: c, boxShadow: rank.color === c ? `0 0 0 2px ${c}` : "none" }}>
              {rank.color === c && <Check size={14} className="mx-auto text-white" />}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-[var(--muted)]">Preview:</span>
        <RankBadge rank={rank} size="md" />
      </div>
      <div className="flex gap-2">
        <button onClick={onSave} className="flex-1 rounded-lg bg-nebula-600 py-2 text-sm font-semibold text-white">Save</button>
        <button onClick={onCancel} className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm">Cancel</button>
      </div>
    </div>
  );
}
