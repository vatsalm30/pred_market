import { NextRequest, NextResponse } from "next/server";
import { fromStream } from "@/lib/streamAuth";
import { saveArbStats, saveHistory, saveSnapshot, type DayStats } from "@/lib/insights";
import { saveWhaleTrade } from "@/lib/whale";

export const dynamic = "force-dynamic";

interface KalshiTradeIn {
  id: string; ticker: string; title: string; event: string | null; url: string | null;
  side: "YES" | "NO"; price: number; count: number; usd: number; ts: number;
}

// POST { kind, ... } — derived data from the stream service (ws-proxy/src/insights.ts).
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!fromStream(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const hourOk = (h: unknown): h is string => typeof h === "string" && /^\d{4}-\d\d-\d\dT\d\d:00:00\.000Z$/.test(h);

  switch (body?.kind) {
    case "history": {
      const points = Array.isArray(body.points) ? body.points.slice(0, 25) : [];
      if (!hourOk(body.hour)) break;
      const saved = await saveHistory(body.hour, points as { pair: string; k: number | null; p: number | null }[]);
      return NextResponse.json({ ok: true, saved });
    }
    case "snapshot":
      if (!hourOk(body.hour) || typeof body.prices !== "object" || !body.prices) break;
      await saveSnapshot(body.hour, body.prices as Record<string, [number | null, number | null]>);
      return NextResponse.json({ ok: true });
    case "arbstats":
      if (typeof body.date !== "string" || !/^\d{4}-\d\d-\d\d$/.test(body.date) || !body.stats) break;
      await saveArbStats(body.date, body.stats as DayStats);
      return NextResponse.json({ ok: true });
    case "kalshi_trades": {
      const trades = (Array.isArray(body.trades) ? body.trades.slice(0, 50) : []) as KalshiTradeIn[];
      for (const t of trades) {
        await saveWhaleTrade({
          id: `kalshi:${t.id}`,
          venue: "kalshi",
          marketTitle: t.event ? `${t.event} — ${t.title}` : t.title,
          marketUrl: t.url ?? `https://kalshi.com/markets/${t.ticker}`,
          conditionId: "",
          assetId: t.ticker,
          outcome: t.side === "YES" ? "Yes" : "No",
          side: "BUY",
          size: t.count,
          price: t.price,
          usdValue: t.usd,
          traderAddress: "",
          timestamp: Math.floor(t.ts / 1000),
        });
      }
      return NextResponse.json({ ok: true, saved: trades.length });
    }
  }
  return NextResponse.json({ error: "Bad request" }, { status: 400 });
}
