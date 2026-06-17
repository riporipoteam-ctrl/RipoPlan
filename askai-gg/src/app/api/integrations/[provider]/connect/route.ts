import { NextResponse } from "next/server";

export async function POST(
  _request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  const { provider } = await context.params;

  return NextResponse.json({
    ok: true,
    provider,
    redirectUrl: `/integrations?provider=${provider}&status=mock-connected`,
  });
}
