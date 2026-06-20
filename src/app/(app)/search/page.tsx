"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { TopBar } from "@/components/TopBar";
import { Search as SearchIcon } from "lucide-react";

export default function SearchPage() {
  const supabase = createClient();
  const [q, setQ] = useState("");
  const [threads, setThreads] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (q.trim().length < 2) {
        setThreads([]);
        setAgents([]);
        return;
      }
      const [{ data: th }, { data: ag }] = await Promise.all([
        supabase.from("threads").select("id,title,summary").ilike("title", `%${q}%`).limit(10),
        supabase.from("agents").select("id,name,role").ilike("name", `%${q}%`).limit(10),
      ]);
      setThreads(th || []);
      setAgents(ag || []);
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <>
      <TopBar title="Search" back="/home" />
      <div className="flex-1 px-4 py-4">
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2">
          <SearchIcon size={18} className="text-[var(--muted)]" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search threads and agents…"
            className="w-full bg-transparent text-sm outline-none"
          />
        </div>

        {agents.length > 0 && (
          <div className="mb-4">
            <h3 className="mb-2 text-xs font-semibold uppercase text-[var(--muted)]">Agents</h3>
            {agents.map((a) => (
              <Link key={a.id} href={`/agents/${a.id}`} className="block rounded-xl px-2 py-2 hover:bg-black/5">
                <div className="font-medium">{a.name}</div>
                <div className="text-xs text-[var(--muted)]">{a.role}</div>
              </Link>
            ))}
          </div>
        )}
        {threads.length > 0 && (
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase text-[var(--muted)]">Threads</h3>
            {threads.map((t) => (
              <Link key={t.id} href={`/threads/${t.id}`} className="block rounded-xl px-2 py-2 hover:bg-black/5">
                <div className="font-medium">{t.title}</div>
                <div className="truncate text-xs text-[var(--muted)]">{t.summary}</div>
              </Link>
            ))}
          </div>
        )}
        {q.length >= 2 && agents.length === 0 && threads.length === 0 && (
          <p className="text-center text-sm text-[var(--muted)]">No results for &quot;{q}&quot;</p>
        )}
      </div>
    </>
  );
}
