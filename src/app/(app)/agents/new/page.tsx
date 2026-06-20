"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { TopBar } from "@/components/TopBar";
import { Sparkles, Loader2, ArrowUp } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/lib/session";
import { createAgent } from "@/lib/actions";

const EXAMPLES = [
  "Create a Research Agent that every morning searches the top AI news, summarizes it, and posts to #news.",
  "A code reviewer that checks pull requests and explains issues in plain English.",
  "A daily digest agent that compiles my tasks and emails me a summary at 8am.",
  "A support handler that drafts friendly replies to customer questions.",
];

export default function NewAgentPage() {
  const router = useRouter();
  const supabase = createClient();
  const { ctx } = useSession();
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function create() {
    if (!text.trim() || loading || !ctx) return;
    setLoading(true);
    setErr(null);
    try {
      const agentId = await createAgent(supabase, ctx, text);
      if (agentId) router.push(`/agent?id=${agentId}`);
      else setErr("Failed to create agent");
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <TopBar title="Create an agent" back="/agents" />
      <div className="flex-1 space-y-5 px-4 py-5">
        <div className="rounded-2xl border border-[var(--border)] bg-gradient-to-br from-nebula-50 to-transparent p-5 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-nebula-500 to-nebula-pink">
            <Sparkles className="text-white" size={24} />
          </div>
          <h2 className="text-lg font-bold">Describe your agent</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Tell me what you want in plain language. I&apos;ll set up its role, tools, and schedule.
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder="e.g. Create a Research Agent that daily searches AI news, summarizes, and posts to #news."
            className="w-full resize-none bg-transparent text-[15px] outline-none placeholder:text-[var(--muted)]"
          />
          <div className="flex justify-end">
            <button
              onClick={create}
              disabled={!text.trim() || loading}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-br from-nebula-600 to-nebula-pink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <ArrowUp size={16} />}
              {loading ? "Building agent…" : "Create agent"}
            </button>
          </div>
        </div>

        {err && <p className="text-sm text-red-500">{err}</p>}

        <div>
          <p className="mb-2 px-1 text-sm font-semibold text-[var(--muted)]">Try an example</p>
          <div className="space-y-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => setText(ex)}
                className="block w-full rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 text-left text-sm hover:border-nebula-400"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
