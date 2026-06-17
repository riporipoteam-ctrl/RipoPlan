import { NextResponse } from "next/server";

import { getChannelBundle } from "@/lib/mock-data";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return NextResponse.json(getChannelBundle(id));
}
