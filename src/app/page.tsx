"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function Index() {
  const router = useRouter();
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      router.replace(data.user ? "/home" : "/login");
    });
  }, [router]);
  return (
    <div className="flex min-h-dvh items-center justify-center bg-ink text-sm text-ink-muted">
      Loading…
    </div>
  );
}
