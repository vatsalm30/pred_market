import { NextRequest, NextResponse } from "next/server";
import { getArbStatsSince, LIFETIME_BUCKETS, PROFIT_TIERS, type Tier } from "@/lib/insights";

export const dynamic = "force-dynamic";

// GET ?days=7 — how long arbitrage gaps stayed open, summed over the period by profit tier.
export async function GET(req: NextRequest): Promise<NextResponse> {
  const days = Math.min(30, Math.max(1, parseInt(req.nextUrl.searchParams.get("days") ?? "7") || 7));
  const rows = await getArbStatsSince(days);
  const tiers = Object.keys(PROFIT_TIERS) as Tier[];
  const total = Object.fromEntries(tiers.map((t) => [t, { n: 0, sum_s: 0, buckets: LIFETIME_BUCKETS.map(() => 0) }]));
  for (const { stats } of rows) {
    for (const t of tiers) {
      const s = stats?.[t];
      if (!s) continue;
      total[t].n += s.n;
      total[t].sum_s += s.sum_s;
      s.buckets.forEach((v, i) => (total[t].buckets[i] += v));
    }
  }
  const daily = rows.map(({ date, stats }) => ({ date, n: tiers.reduce((s, t) => s + (stats?.[t]?.n ?? 0), 0) }));
  return NextResponse.json(
    { days, buckets: LIFETIME_BUCKETS, tiers: PROFIT_TIERS, total, daily },
    { headers: { "Cache-Control": "public, max-age=600" } }
  );
}
