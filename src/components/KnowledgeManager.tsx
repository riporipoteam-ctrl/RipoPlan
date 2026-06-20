"use client";

import { useState } from "react";
import { Plus, Trash2, Loader2, BookOpen } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/lib/session";
import { addKnowledge, deleteKnowledge } from "@/lib/actions";

interface Item {
  id: string;
  title: string;
  content: string | null;
}

export function KnowledgeManager({ initial }: { initial: Item[] }) {
  const supabase = createClient();
  const { ctx } = useSession();
  const [items, setItems] = useState<Item[]>(initial);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!title.trim() || busy || !ctx) return;
    setBusy(true);
    const item = await addKnowledge(supabase, ctx, title, content);
    if (item) setItems((p) => [item as Item, ...p]);
    setTitle("");
    setContent("");
    setOpen(false);
    setBusy(false);
  }

  async function remove(id: string) {
    if (!ctx) return;
    setItems((p) => p.filter((i) => i.id !== id));
    await deleteKnowledge(supabase, ctx, id);
  }

  return (
    <div className="space-y-3">
      {open ? (
        <div className="space-y-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (e.g. Brand voice, Company facts)"
            className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-nebula-500"
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            placeholder="Knowledge your agents should always know…"
            className="w-full resize-none rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-nebula-500"
          />
          <div className="flex justify-end gap-2">
            <button onClick={() => setOpen(false)} className="rounded-lg px-3 py-1.5 text-sm text-[var(--muted)]">
              Cancel
            </button>
            <button
              onClick={add}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-lg bg-nebula-600 px-3 py-1.5 text-sm font-medium text-white"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--border)] py-3 text-sm font-medium text-nebula-600 hover:bg-nebula-50"
        >
          <Plus size={16} /> Add knowledge
        </button>
      )}

      {items.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-[var(--muted)]">
          <BookOpen />
          No knowledge yet. Add facts, brand voice, or context your agents should always know.
        </div>
      )}
      {items.map((it) => (
        <div key={it.id} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="font-semibold">{it.title}</div>
            <button onClick={() => remove(it.id)} className="text-[var(--muted)] hover:text-red-500">
              <Trash2 size={15} />
            </button>
          </div>
          {it.content && <p className="mt-1 text-sm text-[var(--muted)]">{it.content}</p>}
        </div>
      ))}
    </div>
  );
}
