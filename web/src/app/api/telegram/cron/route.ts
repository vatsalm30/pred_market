import { NextRequest, NextResponse } from "next/server";
import { Receiver } from "@upstash/qstash";
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
export const maxDuration = 60;

const MIN_PROFIT_PCT = 2.0;
const MAX_ALERTS_PER_RUN = 5;

async function runScan() {
  const scan = await findLiveOpportunities();
  const actionable = scan.opportunities.filter((o) => o.net_profit_pct >= MIN_PROFIT_PCT);

  const newOpps = [];
  for (const o of actionable) {
    if (await markSeen(oppKey(o))) newOpps.push(o);
  }

  await setLastScan();

  if (newOpps.length === 0) {
    return {
      sent: 0,
      stats: scan.stats,
      total_opps: scan.opportunities.length,
      actionable: actionable.length,
    };
  }

  const toSend = newOpps
    .sort((a, b) => b.net_profit_pct - a.net_profit_pct)
    .slice(0, MAX_ALERTS_PER_RUN);

  await recordAlerts(toSend);

  const subscribers = await getSubscriberIds();
  if (subscribers.length === 0) {
    return { sent: 0, new_opps: newOpps.length, subscribers: 0, stats: scan.stats };
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

  return {
    sent,
    new_opps: newOpps.length,
    alerted: toSend.length,
    subscribers: subscribers.length,
    removed_blocked: blocked.length,
    stats: scan.stats,
    total_opps: scan.opportunities.length,
  };
}

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
 * Manual / local trigger via Bearer token. Used for testing.
 * Production scheduling happens via QStash → POST.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  if (searchParams.get("test") === "true") {
    return NextResponse.json(await sendTestAlert());
  }

  try {
    return NextResponse.json(await runScan());
  } catch (e) {
    return NextResponse.json(
      { error: "Live scan failed", message: (e as Error).message },
      { status: 500 }
    );
  }
}

/**
 * Scheduled trigger from Upstash QStash. Verifies the HMAC signature
 * QStash attaches to every delivery before running the scan.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const signature = req.headers.get("upstash-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }

  const body = await req.text();

  const receiver = new Receiver({
    currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY ?? "",
    nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY ?? "",
  });

  try {
    await receiver.verify({ signature, body, url: req.url });
  } catch (e) {
    return NextResponse.json(
      { error: "Invalid signature", message: (e as Error).message },
      { status: 401 }
    );
  }

  try {
    return NextResponse.json(await runScan());
  } catch (e) {
    return NextResponse.json(
      { error: "Live scan failed", message: (e as Error).message },
      { status: 500 }
    );
  }
}
