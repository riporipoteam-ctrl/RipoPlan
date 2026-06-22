import type { SupabaseClient } from "@supabase/supabase-js";
import type { Rank, Agent } from "./types";

export async function fetchRanks(supabase: SupabaseClient, workspaceId: string): Promise<Rank[]> {
  const { data } = await supabase
    .from("ranks")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("position", { ascending: true });
  return (data as Rank[]) || [];
}

export function rankMapById(ranks: Rank[]): Map<string, Rank> {
  return new Map(ranks.map((r) => [r.id, r]));
}

export function rankForAgent(agent: Pick<Agent, "rank_id">, ranks: Map<string, Rank>): Rank | null {
  return agent.rank_id ? ranks.get(agent.rank_id) || null : null;
}

/** Ensure a workspace has a default "Chief of <name>" rank and the supervisor wears it. */
export async function ensureDefaultRank(
  supabase: SupabaseClient,
  workspaceId: string,
  workspaceName: string
): Promise<void> {
  const ranks = await fetchRanks(supabase, workspaceId);
  let chief = ranks.find((r) => r.is_default);
  if (!chief) {
    const { data } = await supabase
      .from("ranks")
      .insert({ workspace_id: workspaceId, name: `Chief of ${workspaceName}`, color: "#f5a623", badge: "crown", position: 0, is_default: true })
      .select("*")
      .single();
    chief = data as Rank;
  }
  if (chief) {
    await supabase.from("agents").update({ rank_id: chief.id }).eq("workspace_id", workspaceId).eq("is_supervisor", true).is("rank_id", null);
  }
}
