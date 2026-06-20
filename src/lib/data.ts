import { createClient } from "@/lib/supabase/server";
import type { Agent, Channel, Message, Profile, Thread, Workspace } from "./types";

export async function getSessionContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  // First workspace the user belongs to
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id, role, workspaces(*)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const workspace = (membership?.workspaces as unknown as Workspace) || null;

  return {
    userId: user.id,
    profile: (profile as Profile) || {
      id: user.id,
      email: user.email ?? null,
      display_name: user.email?.split("@")[0] ?? null,
      avatar_url: null,
      avatar_color: "#ef4444",
    },
    workspace,
    role: membership?.role ?? "member",
  };
}

export async function getAgents(workspaceId: string): Promise<Agent[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("agents")
    .select("*")
    .eq("workspace_id", workspaceId)
    .neq("status", "archived")
    .order("created_at", { ascending: true });
  return (data as Agent[]) || [];
}

export async function getChannels(workspaceId: string): Promise<Channel[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("channels")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });
  return (data as Channel[]) || [];
}

export async function getThreads(workspaceId: string): Promise<Thread[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("threads")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("last_activity_at", { ascending: false })
    .limit(50);
  return (data as Thread[]) || [];
}

export async function getThread(id: string): Promise<Thread | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("threads").select("*").eq("id", id).maybeSingle();
  return (data as Thread) || null;
}

export async function getMessagesForThread(threadId: string): Promise<Message[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("messages")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  return (data as Message[]) || [];
}

export async function getMessagesForChannel(channelId: string): Promise<Message[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("messages")
    .select("*")
    .eq("channel_id", channelId)
    .is("thread_id", null)
    .order("created_at", { ascending: true });
  return (data as Message[]) || [];
}
