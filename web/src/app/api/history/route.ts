import { NextRequest, NextResponse } from "next/server";
import { getHistory } from "@/lib/insights";

export const dynamic = "force-dynamic";

// GET ?pair=<kalshi ticker>:<poly id>&days=7 — hourly implied probabilities on both venues.
export async function GET(req: NextRequest): Promise<NextResponse> {
  const pair = req.nextUrl.searchParams.get("pair") ?? "";
  const days = Math.min(30, Math.max(1, parseInt(req.nextUrl.searchParams.get("days") ?? "7") || 7));
  if (!/^[\w.-]{1,120}:[\w-]{1,80}$/.test(pair)) return NextResponse.json({ error: "Bad pair" }, { status: 400 });
  const points = await getHistory(pair, days);
  return NextResponse.json({ pair, days, points }, { headers: { "Cache-Control": "public, max-age=300" } });
}
