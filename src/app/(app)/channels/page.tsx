"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Hash, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/lib/session";
import { TopBar } from "@/components/TopBar";
import type { Channel } from "@/lib/types";

export default function ChannelsPage() {
  const supabase = createClient();
  const { ctx } = useSession();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <>
      <TopBar title="Channels" subtitle={ctx?.workspace.name} profileName={ctx?.profile.display_name} profileColor={ctx?.profile.avatar_color} />
      <div className="flex-1">
        {loading ? (
          <div className="flex justify-center py-10 text-[var(--muted)]"><Loader2 className="animate-spin" /></div>
        ) : (
          channels.map((c) => (
            <Link key={c.id} href={`/channel?id=${c.id}`} className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3.5 hover:bg-black/[0.02]">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-nebula-100 text-nebula-600">
                <Hash size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{c.name}</div>
                {c.description && <div className="truncate text-sm text-[var(--muted)]">{c.description}</div>}
              </div>
            </Link>
          ))
        )}
      </div>
    </>
  );
}
