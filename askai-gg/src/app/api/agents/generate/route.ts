import { NextResponse } from "next/server";

import { generateAgentDraft } from "@/lib/mock-data";
import { generateAgentRequestSchema } from "@/lib/schemas";

export async function POST(request: Request) {
  const body = await request.json();
  const result = generateAgentRequestSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json({ error: "Invalid agent prompt." }, { status: 400 });
  }

  return NextResponse.json({ draft: generateAgentDraft(result.data.prompt) });
}
