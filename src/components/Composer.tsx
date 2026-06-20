"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Paperclip, ArrowUp, Settings2, Loader2, ChevronDown } from "lucide-react";
import type { Agent } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/lib/session";
import { startThread, runThread, postMessage } from "@/lib/actions";

export function Composer({
  mode,
  threadId,
  channelId,
  agents,
  placeholder,
}: {
  mode: "start" | "thread" | "channel";
  threadId?: string;
  channelId?: string;
  agents: Agent[];
  placeholder?: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const { ctx } = useSession();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

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

  async function send() {
    const content = text.trim();
    if (!content || sending || !ctx) return;
    setSending(true);
    try {
      if (mode === "start") {
        const id = await startThread(supabase, ctx, content);
        if (id) {
          router.push(`/thread?id=${id}`);
          // continue running in the background (SPA keeps this promise alive)
          runThread(supabase, ctx, id, content);
        }
      } else {
        setText("");
        autosize();
        // fire-and-forget; realtime streams the user msg + agent reply into the view
        postMessage(supabase, ctx, { content, threadId, channelId });
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
        <div className="absolute bottom-full mb-2 w-full overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-lg">
          {mentionMatches.slice(0, 5).map((a) => (
            <button
              key={a.id}
              onClick={() => pickMention(a.handle || a.name)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-black/5"
            >
              <span
                className="flex h-6 w-6 items-center justify-center rounded-md text-xs text-white"
                style={{ background: a.avatar_color || "#a855f7" }}
              >
                @
              </span>
              <span className="font-medium">{a.name}</span>
              <span className="text-xs text-[var(--muted)]">@{a.handle}</span>
            </button>
          ))}
        </div>
      )}

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 shadow-sm">
        <textarea
          ref={taRef}
          rows={1}
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
          <button className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-[var(--muted)] hover:bg-black/5">
            <Settings2 size={14} /> Auto <ChevronDown size={12} />
          </button>
          <div className="flex items-center gap-1">
            <button className="rounded-lg p-1.5 text-[var(--muted)] hover:bg-black/5">
              <Paperclip size={18} />
            </button>
            <button
              onClick={send}
              disabled={!text.trim() || sending}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-nebula-600 to-nebula-pink text-white disabled:opacity-40"
            >
              {sending ? <Loader2 size={16} className="animate-spin" /> : <ArrowUp size={18} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
