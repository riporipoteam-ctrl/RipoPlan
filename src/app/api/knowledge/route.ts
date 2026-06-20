import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/data";

export async function POST(req: Request) {
  const ctx = await getSessionContext();
  if (!ctx?.workspace) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { title, content } = await req.json();
  if (!title?.trim()) return NextResponse.json({ error: "title required" }, { status: 400 });
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("knowledge")
    .insert({
      workspace_id: ctx.workspace.id,
      title: title.slice(0, 200),
      content: content || null,
      created_by: ctx.userId,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}

export async function DELETE(req: Request) {
  const ctx = await getSessionContext();
  if (!ctx?.workspace) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await req.json();
  const supabase = await createClient();
  await supabase.from("knowledge").delete().eq("id", id).eq("workspace_id", ctx.workspace.id);
  return NextResponse.json({ ok: true });
}
