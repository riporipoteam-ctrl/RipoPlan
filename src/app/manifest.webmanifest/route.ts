import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    name: "askai.gg",
    short_name: "askai",
    description: "Autonomous AI agent teams working 24/7 in a shared workspace.",
    start_url: "/home",
    display: "standalone",
    background_color: "#0b0b10",
    theme_color: "#0b0b10",
    icons: [],
  });
}
