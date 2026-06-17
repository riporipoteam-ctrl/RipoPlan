import { NextResponse } from "next/server";

import { getAgentBundle } from "@/lib/mock-data";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const { runs } = getAgentBundle(id);

  return NextResponse.json({ runs });
}
