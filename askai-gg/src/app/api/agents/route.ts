import { NextResponse } from "next/server";

import { createAgentFromDraft, getWorkspaceSnapshot } from "@/lib/mock-data";
import { agentDraftSchema } from "@/lib/schemas";

export async function GET() {
  return NextResponse.json({ agents: getWorkspaceSnapshot().agents });
}

export async function POST(request: Request) {
  const body = await request.json();
  const result = agentDraftSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json({ error: "Invalid agent draft." }, { status: 400 });
  }

  return NextResponse.json({ agent: createAgentFromDraft(result.data) });
}
