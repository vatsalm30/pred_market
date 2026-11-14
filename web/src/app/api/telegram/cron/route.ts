import { NextRequest, NextResponse } from "next/server";
import { getSubscriberIds, formatAlert, sendMessage } from "@/lib/bot";

export const dynamic = "force-dynamic";

async function sendTestAlert() {
  const subs = await getSubscriberIds();
  for (const sub of subs) {
    await sendMessage(
      sub,
      formatAlert({
        timestamp: new Date().toISOString(),
        kalshi_market_id: "TEST",
        poly_market_id: "test",
        poly_event: "Will the test alert work?",
        kalshi_event: "Will the test alert work?",
        poly_label: "Yes",
        kalshi_label: "Yes",
        event_score: 0.99,
        outcome_score: 0.99,
        kalshi_leg: "yes",
        poly_leg: "no",
        kalshi_ask: 0.47,
        poly_ask: 0.49,
        gross_cost: 0.96,
        gross_spread: 0.04,
        net_profit_pct: 4.17,
        poly_url: "https://polymarket.com",
        kalshi_url: "https://kalshi.com",
      })
    );
  }
  return { test: true, sent_to: subs.length };
}

/**
 * Bearer-token trigger, still called on schedule by the AWS scheduler Lambda.
 * Arbitrage alerts now come from the live stream (/api/stream/alerts): scanning every
 * market's prices here needs more outbound requests than a Worker may make. ?test=true
 * still sends a sample alert to every subscriber.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (new URL(req.url).searchParams.get("test") === "true") {
    return NextResponse.json(await sendTestAlert());
  }
  return NextResponse.json({ ok: true, note: "alerts are sent from the live stream" });
}
