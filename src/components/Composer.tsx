"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Paperclip, ArrowUp, Settings2, Loader2, ChevronDown, X, FileText, Check } from "lucide-react";
import type { Agent } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/lib/session";
import { startThread, runThread, postMessage, uploadFile, type Attachment } from "@/lib/actions";
import { haptic } from "@/lib/native";
import { AgentAvatar } from "./Avatar";

export function Composer({
  mode,
  threadId,
  channelId,
  agents,
  placeholder,
  presetText,
  presetNonce,
  autoFocus,
}: {
  mode: "start" | "thread" | "channel";
  threadId?: string;
  channelId?: string;
  agents: Agent[];
  placeholder?: string;
  /** When `presetNonce` changes, the composer text is set to `presetText`. */
  presetText?: string;
  presetNonce?: number;
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const { ctx } = useSession();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [agentId, setAgentId] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const selectedAgent = agents.find((a) => a.id === agentId);
  // On the Home composer (top of page) open menus downward; elsewhere upward.
  const dropCls = mode === "start" ? "top-full mt-2" : "bottom-full mb-2";

  // A suggestion chip (or other parent) can seed the composer text + focus it.
  useEffect(() => {
    if (presetNonce === undefined) return;
    setText(presetText || "");
    requestAnimationFrame(() => {
      const el = taRef.current;
      if (el) {
        el.focus();
        el.style.height = "auto";
        el.style.height = Math.min(el.scrollHeight, 160) + "px";
        const end = el.value.length;
        el.setSelectionRange(end, end);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetNonce]);

  function autosize() {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }

  function onChange(v: string) {
    setText(v);
    setShowMentions(/@([\w-]*)$/.test(v));
    autosize();
  }

  function pickMention(handle: string) {
    setText((t) => t.replace(/@([\w-]*)$/, `@${handle} `));
    setShowMentions(false);
    taRef.current?.focus();
  }

  async function onFiles(files: FileList | null) {
    if (!files || !ctx) return;
    setUploading((n) => n + files.length);
    for (const file of Array.from(files)) {
      try {
        const att = await uploadFile(supabase, ctx, file);
        setAttachments((a) => [...a, att]);
      } catch (e) {
        console.error("upload failed", e);
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  async function send() {
    const content = text.trim();
    if ((!content && attachments.length === 0) || sending || uploading > 0 || !ctx) return;
    haptic("medium");
    setSending(true);
    try {
      if (mode === "start") {
        const id = await startThread(supabase, ctx, content, attachments, agentId);
        if (id) {
          const atts = attachments;
          setText("");
          setAttachments([]);
          router.push(`/thread?id=${id}`);
          runThread(supabase, ctx, id, content || "(see attachment)");
          void atts;
        }
      } else {
        const atts = attachments;
        setText("");
        setAttachments([]);
        autosize();
        postMessage(supabase, ctx, { content, threadId, channelId, attachments: atts, forcedAgentId: agentId });
      }
    } finally {
      setSending(false);
    }
  }

  const mentionMatches = agents.filter((a) => {
    const q = text.match(/@([\w-]*)$/)?.[1]?.toLowerCase() || "";
    return (a.handle || a.name).toLowerCase().includes(q);
  });

  return (
    <div className="relative">
      {showMentions && mentionMatches.length > 0 && (
        <div className={`absolute ${dropCls} z-30 max-h-60 w-full overflow-auto rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-lg`}>
          {mentionMatches.slice(0, 5).map((a) => (
            <button key={a.id} onClick={() => pickMention(a.handle || a.name)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-black/5">
              <AgentAvatar emoji={a.emoji} color={a.avatar_color} size={22} />
              <span className="font-medium">{a.name}</span>
              <span className="text-xs text-[var(--muted)]">@{a.handle}</span>
            </button>
          ))}
        </div>
      )}

      {pickerOpen && (
        <div className={`absolute ${dropCls} left-0 z-30 max-h-60 w-56 overflow-auto rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-lg`}>
          <button onClick={() => { setAgentId(null); setPickerOpen(false); }} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-black/5">
            <span className="flex items-center gap-2"><Settings2 size={15} /> Auto</span>
            {!agentId && <Check size={14} className="text-nebula-600" />}
          </button>
          {agents.map((a) => (
            <button key={a.id} onClick={() => { setAgentId(a.id); setPickerOpen(false); }} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-black/5">
              <span className="flex items-center gap-2"><AgentAvatar emoji={a.emoji} color={a.avatar_color} size={20} /> {a.name}</span>
              {agentId === a.id && <Check size={14} className="text-nebula-600" />}
            </button>
          ))}
        </div>
      )}

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 shadow-sm">
        {(attachments.length > 0 || uploading > 0) && (
          <div className="mb-2 flex flex-wrap gap-2">
            {attachments.map((a, i) => (
              <div key={i} className="relative">
                {a.type === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.url} alt={a.name} className="h-14 w-14 rounded-lg object-cover" />
                ) : (
                  <div className="flex h-14 items-center gap-1.5 rounded-lg border border-[var(--border)] px-2 text-xs">
                    <FileText size={14} /> <span className="max-w-[80px] truncate">{a.name}</span>
                  </div>
                )}
                <button onClick={() => setAttachments((p) => p.filter((_, j) => j !== i))} className="absolute -right-1.5 -top-1.5 rounded-full bg-black/70 p-0.5 text-white">
                  <X size={11} />
                </button>
              </div>
            ))}
            {uploading > 0 && (
              <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed border-[var(--border)]">
                <Loader2 size={16} className="animate-spin text-[var(--muted)]" />
              </div>
            )}
          </div>
        )}

        <textarea
          ref={taRef}
          rows={1}
          autoFocus={autoFocus}
          value={text}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={placeholder || "What should your agents do?"}
          className="max-h-40 w-full resize-none bg-transparent text-[15px] leading-relaxed outline-none placeholder:text-[var(--muted)]"
        />
        <div className="mt-1 flex items-center justify-between">
          <button onClick={() => { setPickerOpen((o) => !o); setShowMentions(false); }} className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-[var(--muted)] hover:bg-black/5">
            {selectedAgent ? <AgentAvatar emoji={selectedAgent.emoji} color={selectedAgent.avatar_color} size={16} /> : <Settings2 size={14} />}
            {selectedAgent ? selectedAgent.name : "Auto"}
            <ChevronDown size={12} />
          </button>
          <div className="flex items-center gap-1">
            <input ref={fileRef} type="file" multiple accept="image/*,.pdf,.csv,.txt,.md,.json,.doc,.docx" className="hidden" onChange={(e) => onFiles(e.target.files)} />
            <button onClick={() => fileRef.current?.click()} className="rounded-lg p-1.5 text-[var(--muted)] hover:bg-black/5" title="Attach files">
              <Paperclip size={18} />
            </button>
            <button
              onClick={send}
              disabled={(!text.trim() && attachments.length === 0) || sending || uploading > 0}
              className="btn-accent flex h-8 w-8 items-center justify-center rounded-lg text-white disabled:opacity-40"
            >
              {sending ? <Loader2 size={16} className="animate-spin" /> : <ArrowUp size={18} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
