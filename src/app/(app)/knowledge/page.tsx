"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/lib/session";
import { TopBar } from "@/components/TopBar";
import { KnowledgeManager } from "@/components/KnowledgeManager";

export default function KnowledgePage() {
  const supabase = createClient();
  const { ctx } = useSession();
  const [items, setItems] = useState<any[] | null>(null);

  useEffect(() => {
    if (!ctx) return;
    supabase
      .from("knowledge")
      .select("id,title,content")
      .eq("workspace_id", ctx.workspace.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => setItems(data || []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx?.workspace.id]);

  return (
    <>
      <TopBar title="Knowledge" subtitle="Shared context for all your agents" back="/settings" />
      <div className="flex-1 px-4 py-4">
        {items === null ? (
          <div className="flex justify-center py-10 text-[var(--muted)]"><Loader2 className="animate-spin" /></div>
        ) : (
          <KnowledgeManager initial={items} />
        )}
      </div>
    </>
  );
}
