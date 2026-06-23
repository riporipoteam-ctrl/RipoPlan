"use client";

import { useRef, useState } from "react";
import { Loader2, Upload, Check, X } from "lucide-react";
import type { Agent } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/lib/session";
import { updateAgent, uploadFile } from "@/lib/actions";
import { AgentAvatar } from "./Avatar";

export function AgentEditor({ agent, onChange }: { agent: Agent; onChange: (a: Agent) => void }) {
  const supabase = createClient();
  const { ctx } = useSession();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(agent.name);
  const [role, setRole] = useState(agent.role || "");
  const [description, setDescription] = useState(agent.description || "");
  const [prompt, setPrompt] = useState(agent.system_prompt || "");
  const [memory, setMemory] = useState(agent.memory_enabled);
  const [avatarUrl, setAvatarUrl] = useState(agent.avatar_url || null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onPick(files: FileList | null) {
    if (!files?.[0] || !ctx) return;
    setUploading(true);
    try {
      const att = await uploadFile(supabase, ctx, files[0]);
      setAvatarUrl(att.url);
      await updateAgent(supabase, ctx, agent.id, { avatar_url: att.url });
      onChange({ ...agent, avatar_url: att.url });
    } catch (e) {
      console.error(e);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function save() {
    if (!ctx) return;
    setBusy(true);
    const patch = { name, role, description, system_prompt: prompt, memory_enabled: memory, avatar_url: avatarUrl };
    await updateAgent(supabase, ctx, agent.id, patch);
    onChange({ ...agent, ...patch } as Agent);
    setBusy(false);
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-xl border border-[var(--border)] py-2.5 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5"
      >
        Edit agent
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="flex items-center justify-between">
        <span className="font-semibold">Edit agent</span>
        <button onClick={() => setOpen(false)} className="text-[var(--muted)]"><X size={18} /></button>
      </div>

      <div className="flex items-center gap-3">
        <AgentAvatar emoji={agent.emoji} color={agent.avatar_color} imageUrl={avatarUrl} size={56} />
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onPick(e.target.files)} />
        <button onClick={() => fileRef.current?.click()} disabled={uploading} className="flex items-center gap-1.5 rounded-xl border border-[var(--border)] px-3 py-2 text-sm">
          {uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />} Upload picture
        </button>
        {avatarUrl && (
          <button onClick={() => { setAvatarUrl(null); }} className="text-xs text-red-500">Remove</button>
        )}
      </div>

      <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} className={INP} /></Field>
      <Field label="Role"><input value={role} onChange={(e) => setRole(e.target.value)} className={INP} /></Field>
      <Field label="Description"><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={INP} /></Field>
      <Field label="Personality / system prompt"><textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} className={INP} /></Field>

      <label className="flex items-center justify-between text-sm">
        <span>Long-term memory</span>
        <button onClick={() => setMemory((m) => !m)} className={`relative h-6 w-11 rounded-full ${memory ? "bg-nebula-600" : "bg-[var(--border)]"}`}>
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${memory ? "left-[22px]" : "left-0.5"}`} />
        </button>
      </label>

      <button onClick={save} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-nebula-600 to-nebula-pink py-2.5 text-sm font-semibold text-white disabled:opacity-60">
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Save changes
      </button>
    </div>
  );
}

const INP = "w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-nebula-500";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-[var(--muted)]">{label}</div>
      {children}
    </div>
  );
}
