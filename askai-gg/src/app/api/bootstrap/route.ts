import { NextResponse } from "next/server";

import { getWorkspaceSnapshot } from "@/lib/mock-data";

export async function GET() {
  return NextResponse.json(getWorkspaceSnapshot());
}
