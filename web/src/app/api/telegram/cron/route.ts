import { NextRequest, NextResponse } from "next/server";
import {
  getSubscriberIds,
  removeSubscriber,
  markSeen,
  formatAlert,
  oppKey,
  sendMessage,
  recordAlerts,
  setLastScan,
} from "@/lib/bot";
import { findLiveOpportunities } from "@/lib/arbitrage";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Vercel hobby plan ceiling

const MIN_PROFIT_PCT = 2.0;
const MAX_ALERTS_PER_RUN = 5;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);

  // Test mode: send a hardcoded alert to all subscribers, bypass Redis dedup
  if (searchParams.get("test") === "true") {
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
    return NextResponse.json({ test: true, sent_to: subs.length });
  }

  // Live scan: pull fresh prices, compute arbs on the fly
  let scan;
  try {
    scan = await findLiveOpportunities();
  } catch (e) {
    return NextResponse.json(
      { error: "Live scan failed", message: (e as Error).message },
      { status: 500 }
    );
  }

  const actionable = scan.opportunities.filter((o) => o.net_profit_pct >= MIN_PROFIT_PCT);

  // Determine which are new (not yet seen in last 24h)
  const newOpps = [];
  for (const o of actionable) {
    if (await markSeen(oppKey(o))) newOpps.push(o);
  }

  await setLastScan();

  if (newOpps.length === 0) {
    return NextResponse.json({
      sent: 0,
      stats: scan.stats,
      total_opps: scan.opportunities.length,
      actionable: actionable.length,
    });
  }

  const toSend = newOpps
    .sort((a, b) => b.net_profit_pct - a.net_profit_pct)
    .slice(0, MAX_ALERTS_PER_RUN);

  // Record alerts publicly even if no subscribers — so the /alerts page has a feed
  await recordAlerts(toSend);

  const subscribers = await getSubscriberIds();
  if (subscribers.length === 0) {
    return NextResponse.json({
      sent: 0,
      new_opps: newOpps.length,
      subscribers: 0,
      stats: scan.stats,
    });
  }

  let sent = 0;
  const blocked: number[] = [];
  for (const sub of subscribers) {
    for (const opp of toSend) {
      const ok = await sendMessage(sub, formatAlert(opp));
      if (!ok) {
        blocked.push(sub);
        break;
      }
      sent++;
    }
  }
  await Promise.all(blocked.map((id) => removeSubscriber(id)));

  return NextResponse.json({
    sent,
    new_opps: newOpps.length,
    alerted: toSend.length,
    subscribers: subscribers.length,
    removed_blocked: blocked.length,
    stats: scan.stats,
    total_opps: scan.opportunities.length,
  });
}
