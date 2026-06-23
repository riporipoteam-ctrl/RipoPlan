"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, Bell, ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/lib/session";
import { UserAvatar } from "./Avatar";

export function TopBar({
  title,
  back,
  subtitle,
  profileName,
  profileColor,
  leading,
}: {
  title: string;
  back?: string;
  subtitle?: string;
  profileName?: string | null;
  profileColor?: string | null;
  /** @deprecated count is now read live from the notifications table */
  notifCount?: number;
  leading?: React.ReactNode;
}) {
  const supabase = createClient();
  const router = useRouter();
  const { ctx } = useSession();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!ctx) return;
    let active = true;
    const load = async () => {
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", ctx.userId)
        .eq("read", false);
      if (active) setUnread(count || 0);
    };
    load();
    const ch = supabase
      .channel(`notif-${ctx.userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${ctx.userId}` }, load)
      .subscribe();
    return () => { active = false; supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx?.userId]);

  async function openNotifications() {
    setUnread(0);
    if (ctx) await supabase.from("notifications").update({ read: true }).eq("user_id", ctx.userId).eq("read", false);
    router.push("/activity");
  }

  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-[var(--border)] bg-[var(--bg)]/85 px-4 py-3 backdrop-blur-xl">
      {back ? (
        <Link href={back} className="-ml-1 rounded-lg p-1 text-[var(--text)] transition hover:bg-black/5 active:scale-90">
          <ArrowLeft size={22} />
        </Link>
      ) : leading ? (
        leading
      ) : (
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--card)] text-[10px] font-bold text-[var(--muted)] ring-1 ring-[var(--border)]">
          {(profileName || "AI").slice(0, 2).toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-lg font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="truncate text-xs text-[var(--muted)]">{subtitle}</p>}
      </div>
      {!back && (
        <Link href="/search" className="rounded-full p-1.5 text-[var(--muted)] transition hover:bg-black/5 active:scale-90">
          <Search size={20} />
        </Link>
      )}
      <button onClick={openNotifications} className="relative rounded-full p-1.5 text-[var(--muted)] transition hover:bg-black/5 active:scale-90" aria-label="Notifications">
        <Bell size={20} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 animate-pop-in items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      <Link href="/settings" className="transition active:scale-90">
        <UserAvatar name={profileName} color={profileColor} size={30} />
      </Link>
    </header>
  );
}
