import { NextRequest, NextResponse } from "next/server";
import { fromStream } from "@/lib/streamAuth";
import { allRules } from "@/lib/alerts";
import { setLastScan } from "@/lib/bot";

export const dynamic = "force-dynamic";

// GET — every watchlist rule with an alert, for the stream service to evaluate against live prices.
export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!fromStream(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  // The stream checks in here every 5 minutes; the alerts page shows it as the last scan
  await setLastScan();
  const rules = (await allRules())
    .filter((r) => r.move !== null || r.gap !== null)
    .map((r) => ({
      key: `${r.user_id}#${r.pair_id}`,
      pair_id: r.pair_id,
      move: r.move,
      gap: r.gap,
      base: r.base,
      last_gap_ts: r.last_gap_ts,
    }));
  return NextResponse.json({ rules });
}
