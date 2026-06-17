import { NextResponse } from "next/server";

import { getAgentBundle } from "@/lib/mock-data";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const { agent } = getAgentBundle(id);

  return NextResponse.json({ agent });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const body = await request.json();
  const { id } = await context.params;

  return NextResponse.json({
    agent: {
      ...body,
      id,
    },
  });
}
