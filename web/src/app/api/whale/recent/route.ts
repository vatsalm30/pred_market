import { NextResponse } from "next/server";
import { getRecentWhales } from "@/lib/whale";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const trades = await getRecentWhales(50);
    return NextResponse.json(trades, {
      headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=60" },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
