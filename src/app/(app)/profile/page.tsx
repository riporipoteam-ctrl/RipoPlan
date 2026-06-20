import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/data";
import { TopBar } from "@/components/TopBar";
import Link from "next/link";
import { UserAvatar } from "@/components/Avatar";
import { ProfileActions } from "@/components/ProfileActions";
import { Clock, LayoutGrid, Bot, ChevronRight } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const ctx = await getSessionContext();
  if (!ctx?.workspace) redirect("/login");

  return (
    <>
      <TopBar title="Profile" back="/home" />
      <div className="flex-1 space-y-4 px-4 py-6">
        <div className="flex flex-col items-center gap-3 py-4">
          <UserAvatar name={ctx.profile.display_name} color={ctx.profile.avatar_color} size={72} />
          <div className="text-center">
            <h2 className="text-xl font-bold">{ctx.profile.display_name}</h2>
            <p className="text-sm text-[var(--muted)]">{ctx.profile.email}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
          <div className="flex items-center justify-between py-1 text-sm">
            <span className="text-[var(--muted)]">Workspace</span>
            <span className="font-medium">{ctx.workspace.name}</span>
          </div>
          <div className="flex items-center justify-between py-1 text-sm">
            <span className="text-[var(--muted)]">Role</span>
            <span className="font-medium capitalize">{ctx.role}</span>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
          {[
            { href: "/jobs", icon: Clock, label: "Jobs", sub: "Scheduled agent runs" },
            { href: "/agents", icon: Bot, label: "Agents", sub: "Manage your team" },
            { href: "/apps", icon: LayoutGrid, label: "Apps & integrations", sub: "Connect your tools" },
          ].map((it) => (
            <Link
              key={it.href}
              href={it.href}
              className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3 last:border-0 hover:bg-black/5"
            >
              <it.icon size={18} className="text-[var(--muted)]" />
              <div className="flex-1">
                <div className="text-sm font-medium">{it.label}</div>
                <div className="text-xs text-[var(--muted)]">{it.sub}</div>
              </div>
              <ChevronRight size={16} className="text-[var(--muted)]" />
            </Link>
          ))}
        </div>

        <ProfileActions />
      </div>
    </>
  );
}
