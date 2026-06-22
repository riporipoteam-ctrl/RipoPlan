"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Hash, Loader2, Plus, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/lib/session";
import { TopBar } from "@/components/TopBar";
import type { Channel } from "@/lib/types";

export default function ChannelsPage() {
  const supabase = createClient();
  const router = useRouter();
  const { ctx } = useSession();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuId, setMenuId] = useState<string | null>(null);

  useEffect(() => {
    if (!ctx) return;
    supabase
      .from("channels")
      .select("*")
      .eq("workspace_id", ctx.workspace.id)
      .order("created_at")
      .then(({ data }) => {
        setChannels((data as Channel[]) || []);
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx?.workspace.id]);

  async function createChannel() {
    if (!ctx) return;
    const name = window.prompt("New channel name")?.trim().toLowerCase().replace(/\s+/g, "-");
    if (!name) return;
    const { data } = await supabase
      .from("channels")
      .insert({ workspace_id: ctx.workspace.id, name, created_by: ctx.profile.id })
      .select("*")
      .single();
    if (data) setChannels((c) => [...c, data as Channel]);
  }

  async function renameChannel(c: Channel) {
    setMenuId(null);
    const name = window.prompt("Rename channel", c.name)?.trim().toLowerCase().replace(/\s+/g, "-");
    if (!name) return;
    setChannels((list) => list.map((x) => (x.id === c.id ? { ...x, name } : x)));
    await supabase.from("channels").update({ name }).eq("id", c.id);
  }

  async function deleteChannel(c: Channel) {
    setMenuId(null);
    if (c.is_default) { window.alert("The default channel can't be deleted."); return; }
    if (!window.confirm(`Delete #${c.name} and all its messages?`)) return;
    setChannels((list) => list.filter((x) => x.id !== c.id));
    await supabase.from("channels").delete().eq("id", c.id);
  }

  return (
    <>
      <TopBar
        title="Channels"
        subtitle={ctx?.workspace.name}
        profileName={ctx?.profile.display_name}
        profileColor={ctx?.profile.avatar_color}
        leading={
          <button onClick={createChannel} className="-ml-1 mr-1 flex h-7 w-7 items-center justify-center rounded-md text-[var(--muted)] hover:bg-black/5" aria-label="New channel">
            <Plus size={20} />
          </button>
        }
      />
      <div className="flex-1">
        {loading ? (
          <div className="flex justify-center py-10 text-[var(--muted)]"><Loader2 className="animate-spin" /></div>
        ) : (
          <>
            {channels.map((c) => (
              <div key={c.id} className="relative flex items-center gap-3 border-b border-[var(--border)] px-4 py-3.5 hover:bg-black/[0.02]">
                <button onClick={() => router.push(`/channel?id=${c.id}`)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-nebula-100 text-nebula-600">
                    <Hash size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{c.name}</div>
                    {c.description && <div className="truncate text-sm text-[var(--muted)]">{c.description}</div>}
                  </div>
                </button>
                <button onClick={() => setMenuId((m) => (m === c.id ? null : c.id))} className="rounded-md p-1 text-[var(--muted)] hover:bg-black/10" aria-label="Channel options">
                  <MoreVertical size={16} />
                </button>
                {menuId === c.id && (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setMenuId(null)} />
                    <div className="absolute right-3 top-12 z-30 w-32 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-lg">
                      <button onClick={() => renameChannel(c)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-black/5">
                        <Pencil size={14} /> Rename
                      </button>
                      <button onClick={() => deleteChannel(c)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-500 hover:bg-black/5">
                        <Trash2 size={14} /> Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
            <button onClick={createChannel} className="m-4 flex w-[calc(100%-2rem)] items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--border)] py-4 text-sm font-medium text-nebula-600 hover:bg-nebula-50">
              <Plus size={18} /> New channel
            </button>
          </>
        )}
      </div>
    </>
  );
}
