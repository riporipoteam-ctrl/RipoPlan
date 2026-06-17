import { NextResponse } from "next/server";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  return NextResponse.json({
    ok: true,
    runId: id,
    status: "queued",
  });
}
