import Link from "next/link";
import { redirect } from "next/navigation";
import { getChannels, getSessionContext } from "@/lib/data";
import { TopBar } from "@/components/TopBar";
import { Hash } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ChannelsPage() {
  const ctx = await getSessionContext();
  if (!ctx?.workspace) redirect("/login");
  const channels = await getChannels(ctx.workspace.id);

  return (
    <>
      <TopBar
        title="Channels"
        subtitle={ctx.workspace.name}
        profileName={ctx.profile.display_name}
        profileColor={ctx.profile.avatar_color}
      />
      <div className="flex-1">
        {channels.map((c) => (
          <Link
            key={c.id}
            href={`/channels/${c.id}`}
            className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3.5 hover:bg-black/[0.02]"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-nebula-100 text-nebula-600">
              <Hash size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{c.name}</div>
              {c.description && (
                <div className="truncate text-sm text-[var(--muted)]">{c.description}</div>
              )}
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
