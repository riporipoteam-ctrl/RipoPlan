"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Splash } from "@/components/Splash";

export default function Index() {
  const router = useRouter();
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      // Logged-in users land straight in a fresh chat (ChatGPT-style), not Home.
      router.replace(data.user ? "/home?new=1" : "/login");
    });
  }, [router]);
  return <Splash label="Starting your workspace" />;
}
