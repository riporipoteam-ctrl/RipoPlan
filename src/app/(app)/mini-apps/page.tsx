import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionContext } from "@/lib/data";
import { TopBar } from "@/components/TopBar";
import { Boxes, Plus } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function MiniAppsPage() {
  const ctx = await getSessionContext();
  if (!ctx?.workspace) redirect("/login");

  return (
    <>
      <TopBar title="Mini Apps" subtitle="Reusable agent-powered apps" back="/settings" />
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-nebula-100 text-nebula-600">
          <Boxes size={26} />
        </div>
        <h2 className="text-lg font-bold">No mini apps yet</h2>
        <p className="max-w-xs text-sm text-[var(--muted)]">
          Mini apps package an agent + its tools + a schedule into a one-tap workflow you can reuse
          and share. Create an agent with a schedule to turn it into a recurring app.
        </p>
        <Link
          href="/agents/new"
          className="mt-2 flex items-center gap-2 rounded-xl bg-gradient-to-br from-nebula-600 to-nebula-pink px-4 py-2.5 text-sm font-semibold text-white"
        >
          <Plus size={16} /> Create an agent
        </Link>
      </div>
    </>
  );
}
