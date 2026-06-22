import type { SupabaseClient } from "@supabase/supabase-js";
import { getBackendUrl } from "./backend";

/** The user wants the work to continue even after they close the app. */
export function isBackgroundIntent(content: string): boolean {
  return /\b(in the background|keep working|keep going|keep at it|even if i (close|leave|log off)|while i('?m| am) (away|gone|out)|overnight|when i'?m gone|continue working|work on (this|it) (in the )?background|do this in the background|run in the background)\b/i.test(
    content
  );
}

/** Ask the Worker to process the queue now (so it doesn't wait for the cron). */
export async function kickQueue(): Promise<void> {
  const base = getBackendUrl();
  if (!base) return;
  try {
    await fetch(`${base}/tasks/run`, { method: "POST" });
  } catch {}
}

/** Queue a task for the Worker to run server-side. Returns true if enqueued. */
export async function enqueueBackgroundTask(
  supabase: SupabaseClient,
  t: {
    workspaceId: string;
    agentId: string;
    threadId?: string | null;
    channelId?: string | null;
    messageId?: string | null;
    prompt: string;
    createdBy?: string | null;
  }
): Promise<boolean> {
  const { error } = await supabase.from("background_tasks").insert({
    workspace_id: t.workspaceId,
    agent_id: t.agentId,
    thread_id: t.threadId ?? null,
    channel_id: t.channelId ?? null,
    message_id: t.messageId ?? null,
    prompt: t.prompt,
    created_by: t.createdBy ?? null,
  });
  if (error) return false;
  await kickQueue();
  return true;
}
