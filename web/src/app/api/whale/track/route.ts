import { NextRequest, NextResponse } from "next/server";
import {
  saveWhaleTrade, isWhaleSeen, markWhaleSeen, getWhaleWatermark, setWhaleWatermark,
  formatWhaleAlert, type WhaleTrade,
} from "@/lib/whale";
import { getSubscriberIds, sendMessage, removeSubscriber } from "@/lib/bot";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const WHALE_THRESHOLD_USD = parseFloat(process.env.WHALE_THRESHOLD_USD ?? "10000");

interface DataApiTrade {
  proxy_wallet: string;
  side: "BUY" | "SELL";
  token_id: string;
  condition_id: string;
  size: number;
  price: number;
  timestamp: number; // unix seconds
  title: string;
  event_slug?: string;
  outcome?: string;
  transaction_hash?: string;
}

const MAX_NEW_PER_RUN = 20; // Workers allow 50 outbound requests per invocation

// Polymarket's public data API returns recent trades over a cash threshold across every market
// in one request (the CLOB /trades endpoint now needs an API key).
async function fetchLargeTrades(): Promise<DataApiTrade[]> {
  const url = `https://data-api.polymarket.com/v2/trades?limit=50&filter_type=CASH&filter_amount=${WHALE_THRESHOLD_USD}`;
  const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error(`Polymarket trades: HTTP ${r.status}`);
  return ((await r.json()) as { data?: DataApiTrade[] }).data ?? [];
}

async function trackWhales(): Promise<{ found: number; alerted: number }> {
  const trades = await fetchLargeTrades();
  const since = await getWhaleWatermark();
  const fresh = trades
    .filter((t) => t.timestamp >= since && t.size * t.price >= WHALE_THRESHOLD_USD)
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-MAX_NEW_PER_RUN);

  const newWhales: WhaleTrade[] = [];
  for (const t of fresh) {
    const id = `${t.transaction_hash ?? t.timestamp}:${t.token_id.slice(-12)}:${t.side}:${t.size}`;
    // Trades in the watermark's own second may have been saved last run
    if (t.timestamp === since && (await isWhaleSeen(id))) continue;
    const trade: WhaleTrade = {
      id,
      venue: "polymarket",
      marketTitle: t.title,
      marketSlug: t.event_slug,
      conditionId: t.condition_id,
      assetId: t.token_id,
      outcome: t.outcome ?? "Yes",
      side: t.side,
      size: t.size,
      price: t.price,
      usdValue: t.size * t.price,
      traderAddress: t.proxy_wallet,
      txHash: t.transaction_hash,
      timestamp: t.timestamp,
    };
    await saveWhaleTrade(trade);
    if (t.timestamp === fresh[fresh.length - 1].timestamp) await markWhaleSeen(id);
    newWhales.push(trade);
  }
  if (fresh.length) await setWhaleWatermark(fresh[fresh.length - 1].timestamp);

  const toAlert = [...newWhales].sort((a, b) => b.usdValue - a.usdValue).slice(0, 3);
  let alerted = 0;

  if (toAlert.length > 0) {
    const subscriberIds = await getSubscriberIds();
    for (const trade of toAlert) {
      const text = formatWhaleAlert(trade);
      for (const chatId of subscriberIds) {
        const ok = await sendMessage(chatId, text);
        if (!ok) await removeSubscriber(chatId);
      }
      alerted++;
    }
  }

  return { found: newWhales.length, alerted };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const result = await trackWhales();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
