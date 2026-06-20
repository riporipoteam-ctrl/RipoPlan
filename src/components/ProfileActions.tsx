"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Moon, Sun, LogOut } from "lucide-react";

export function ProfileActions() {
  const router = useRouter();
  const supabase = createClient();
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggleTheme() {
    const root = document.documentElement;
    const next = !root.classList.contains("dark");
    root.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
    setDark(next);
  }

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <button
        onClick={toggleTheme}
        className="flex w-full items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm"
      >
        <span className="flex items-center gap-2">
          {dark ? <Moon size={18} /> : <Sun size={18} />}
          Theme
        </span>
        <span className="text-[var(--muted)]">{dark ? "Dark" : "Light"}</span>
      </button>
      <button
        onClick={logout}
        className="flex w-full items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm text-red-500"
      >
        <LogOut size={18} /> Log out
      </button>
    </div>
  );
}
