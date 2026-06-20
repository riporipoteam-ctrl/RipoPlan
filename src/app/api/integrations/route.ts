import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/data";

// NOTE: Real OAuth requires per-provider client credentials + redirect handling.
// This endpoint records a (simulated) connection so agents can be granted scopes.
// Wire real OAuth by replacing this with provider authorize/callback routes.
export async function POST(req: Request) {
  const ctx = await getSessionContext();
  if (!ctx?.workspace) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { provider, connect } = await req.json();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("integrations")
    .select("id")
    .eq("workspace_id", ctx.workspace.id)
    .eq("provider", provider)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("integrations")
      .update({ status: connect ? "connected" : "available", account_label: connect ? ctx.profile.email : null })
      .eq("id", existing.id);
  } else if (connect) {
    await supabase.from("integrations").insert({
      workspace_id: ctx.workspace.id,
      provider,
      status: "connected",
      account_label: ctx.profile.email,
      connected_by: ctx.userId,
    });
  }
  return NextResponse.json({ ok: true });
}
