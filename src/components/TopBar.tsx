import Link from "next/link";
import { Search, Bell, ArrowLeft } from "lucide-react";
import { UserAvatar } from "./Avatar";

export function TopBar({
  title,
  back,
  subtitle,
  profileName,
  profileColor,
  notifCount = 0,
  leading,
}: {
  title: string;
  back?: string;
  subtitle?: string;
  profileName?: string | null;
  profileColor?: string | null;
  notifCount?: number;
  leading?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-[var(--border)] bg-[var(--bg)]/95 px-4 py-3 backdrop-blur">
      {back ? (
        <Link href={back} className="-ml-1 rounded-lg p-1 text-[var(--text)] hover:bg-black/5">
          <ArrowLeft size={22} />
        </Link>
      ) : leading ? (
        leading
      ) : (
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--card)] text-[10px] font-bold text-[var(--muted)] ring-1 ring-[var(--border)]">
          {(profileName || "RI").slice(0, 2).toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-lg font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="truncate text-xs text-[var(--muted)]">{subtitle}</p>}
      </div>
      {!back && (
        <Link href="/search" className="rounded-full p-1.5 text-[var(--muted)] hover:bg-black/5">
          <Search size={20} />
        </Link>
      )}
      <Link href="/activity" className="relative rounded-full p-1.5 text-[var(--muted)] hover:bg-black/5">
        <Bell size={20} />
        {notifCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {notifCount}
          </span>
        )}
      </Link>
      <Link href="/settings">
        <UserAvatar name={profileName} color={profileColor} size={30} />
      </Link>
    </header>
  );
}
