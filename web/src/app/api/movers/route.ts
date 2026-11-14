import { NextResponse } from "next/server";
import { getMovers } from "@/lib/insights";

export const dynamic = "force-dynamic";

// GET — matched markets whose probability moved most in the last 24 hours.
export async function GET(): Promise<NextResponse> {
  const data = await getMovers(20).catch(() => ({ hour: null, movers: [] }));
  return NextResponse.json(data, { headers: { "Cache-Control": "public, max-age=300" } });
}
