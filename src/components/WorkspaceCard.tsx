"use client";

import { useRef, useState } from "react";
import { Loader2, Camera, Check, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/lib/session";
import { uploadFile } from "@/lib/actions";

export function WorkspaceCard() {
  const supabase = createClient();
  const { ctx, refresh } = useSession();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(ctx?.workspace.name || "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!ctx) return null;
  const ws = ctx.workspace;

  async function saveName() {
    const v = name.trim();
    if (!v || v === ws.name) { setEditing(false); return; }
    setBusy(true);
    await supabase.from("workspaces").update({ name: v }).eq("id", ws.id);
    await refresh();
    setBusy(false);
    setEditing(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1400);
  }

  async function onAvatar(file: File | null) {
    if (!file) return;
    setBusy(true);
    try {
      const att = await uploadFile(supabase, ctx!, file);
      await supabase.from("workspaces").update({ avatar_url: att.url }).eq("id", ws.id);
      await refresh();
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
      <button onClick={() => fileRef.current?.click()} className="relative shrink-0" title="Change workspace picture">
        {ws.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={ws.avatar_url} alt="" className="h-14 w-14 rounded-2xl object-cover" />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-nebula-600 to-nebula-pink text-xl font-bold text-white">
            {(ws.name || "W").charAt(0).toUpperCase()}
          </div>
        )}
        <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--card)] text-[var(--muted)] shadow ring-1 ring-[var(--border)]">
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />}
        </span>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onAvatar(e.target.files?.[0] || null)} />
      </button>

      <div className="min-w-0 flex-1">
        {editing ? (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveName()}
              className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-transparent px-2 py-1.5 text-sm outline-none focus:border-nebula-500"
            />
            <button onClick={saveName} disabled={busy} className="rounded-lg bg-nebula-600 p-1.5 text-white">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            </button>
          </div>
        ) : (
          <button onClick={() => { setName(ws.name); setEditing(true); }} className="flex items-center gap-1.5 text-left">
            <span className="truncate text-base font-bold">{ws.name}</span>
            {saved ? <Check size={14} className="text-emerald-500" /> : <Pencil size={13} className="text-[var(--muted)]" />}
          </button>
        )}
        <div className="text-xs text-[var(--muted)]">Workspace · tap name or photo to edit</div>
      </div>
    </div>
  );
}
