import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/data";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getSessionContext();
  if (!ctx?.workspace) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const allowed: Record<string, any> = {};
  for (const k of ["name", "role", "description", "goals", "status", "schedule", "memory_enabled", "tools", "system_prompt"]) {
    if (k in body) allowed[k] = body[k];
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agents")
    .update(allowed)
    .eq("id", id)
    .eq("workspace_id", ctx.workspace.id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ agent: data });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getSessionContext();
  if (!ctx?.workspace) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = await createClient();
  await supabase
    .from("agents")
    .update({ status: "archived" })
    .eq("id", id)
    .eq("workspace_id", ctx.workspace.id);
  return NextResponse.json({ ok: true });
}
