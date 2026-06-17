import { NextResponse } from "next/server";

import { createMessageResponse } from "@/lib/mock-data";
import { messageRequestSchema } from "@/lib/schemas";

export async function POST(request: Request) {
  const body = await request.json();
  const result = messageRequestSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      { error: "Invalid message payload." },
      { status: 400 },
    );
  }

  return NextResponse.json(
    createMessageResponse(result.data.channelId, result.data.body),
  );
}
