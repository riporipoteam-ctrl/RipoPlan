import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/data";
import { TopBar } from "@/components/TopBar";
import { KnowledgeManager } from "@/components/KnowledgeManager";

export const dynamic = "force-dynamic";

export default async function KnowledgePage() {
  const ctx = await getSessionContext();
  if (!ctx?.workspace) redirect("/login");
  const supabase = await createClient();
  const { data } = await supabase
    .from("knowledge")
    .select("id,title,content")
    .eq("workspace_id", ctx.workspace.id)
    .order("created_at", { ascending: false });

  return (
    <>
      <TopBar title="Knowledge" subtitle="Shared context for all your agents" back="/settings" />
      <div className="flex-1 px-4 py-4">
        <KnowledgeManager initial={(data as any) || []} />
      </div>
    </>
  );
}
