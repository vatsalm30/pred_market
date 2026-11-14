import { NextRequest, NextResponse } from "next/server";
import { fromStream } from "@/lib/streamAuth";
import { getArbStats } from "@/lib/insights";

export const dynamic = "force-dynamic";

// GET ?date=YYYY-MM-DD — lets a restarted stream service continue today's gap stats.
export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!fromStream(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const date = req.nextUrl.searchParams.get("date") ?? "";
  if (!/^\d{4}-\d\d-\d\d$/.test(date)) return NextResponse.json({ error: "Bad date" }, { status: 400 });
  return NextResponse.json({ stats: await getArbStats(date) });
}
