"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Profile, Workspace } from "./types";

export interface SessionCtx {
  userId: string;
  profile: Profile;
  workspace: Workspace;
  role: string;
}

interface State {
  loading: boolean;
  ctx: SessionCtx | null;
  refresh: () => Promise<void>;
}

const Ctx = createContext<State>({ loading: true, ctx: null, refresh: async () => {} });
export const useSession = () => useContext(Ctx);

export function SessionProvider({
  children,
  requireAuth = true,
}: {
  children: React.ReactNode;
  requireAuth?: boolean;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [ctx, setCtx] = useState<SessionCtx | null>(null);

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setCtx(null);
      setLoading(false);
      if (requireAuth) router.replace("/login");
      return;
    }
    const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    let membership = null;
    // The bootstrap trigger may still be running on first signup — retry briefly.
    for (let i = 0; i < 6; i++) {
      const { data } = await supabase
        .from("workspace_members")
        .select("workspace_id, role, workspaces(*)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (data?.workspace_id) {
        membership = data;
        break;
      }
      await new Promise((r) => setTimeout(r, 600));
    }
    setCtx({
      userId: user.id,
      profile:
        (profile as Profile) ||
        ({ id: user.id, email: user.email ?? null, display_name: user.email?.split("@")[0] ?? null, avatar_url: null, avatar_color: "#ef4444" } as Profile),
      workspace: (membership?.workspaces as unknown as Workspace) || (null as any),
      role: membership?.role ?? "member",
    });
    setLoading(false);
  }, [requireAuth, router, supabase]);

  useEffect(() => {
    load();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session && requireAuth) router.replace("/login");
    });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <Ctx.Provider value={{ loading, ctx, refresh: load }}>{children}</Ctx.Provider>;
}
