import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "askai.gg",
    model: process.env.GROQ_MODEL || "qwen/qwen3.6-27b",
    time: new Date().toISOString(),
  });
}
