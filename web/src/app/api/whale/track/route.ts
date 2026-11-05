import { NextRequest, NextResponse } from "next/server";
import {
  saveWhaleTrade, isWhaleSeen, markWhaleSeen,
  cacheMarket, formatWhaleAlert,
  type WhaleTrade,
} from "@/lib/whale";
import { getSubscriberIds, sendMessage, removeSubscriber } from "@/lib/bot";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const WHALE_THRESHOLD_USD = parseFloat(process.env.WHALE_THRESHOLD_USD ?? "10000");

interface GammaMarket {
  conditionId: string;
  question: string;
  slug?: string;
}

interface CLOBTrade {
  id: string;
  market: string;
  asset_id: string;
  side: "BUY" | "SELL";
  size: string;
  price: string;
  outcome?: string;
  owner?: string;
  maker_address?: string;
  transaction_hash?: string;
  match_time: string;
}

async function getTopMarkets(): Promise<GammaMarket[]> {
  try {
    const r = await fetch(
      "https://gamma-api.polymarket.com/markets?limit=25&order=volumeNum&ascending=false&active=true",
      { cache: "no-store" }
    );
    if (!r.ok) return [];
    const data = await r.json();
    const markets: GammaMarket[] = Array.isArray(data) ? data : (data.markets ?? []);
    return markets.filter((m) => m.conditionId && m.question);
  } catch {
    return [];
  }
}

async function fetchCLOBTrades(conditionId: string): Promise<CLOBTrade[]> {
  try {
    const r = await fetch(
      `https://clob.polymarket.com/trades?market=${conditionId}&limit=50`,
      { cache: "no-store" }
    );
    if (!r.ok) return [];
    const data = await r.json();
    return Array.isArray(data) ? data : (data.data ?? []);
  } catch {
    return [];
  }
}

async function trackWhales(): Promise<{ found: number; alerted: number }> {
  const markets = await getTopMarkets();
  if (markets.length === 0) return { found: 0, alerted: 0 };

  for (const m of markets) {
    await cacheMarket(m.conditionId, { title: m.question, slug: m.slug });
  }

  const newWhales: WhaleTrade[] = [];

  for (let i = 0; i < markets.length; i += 5) {
    const batch = markets.slice(i, i + 5);
    const tradeArrays = await Promise.all(batch.map((m) => fetchCLOBTrades(m.conditionId)));

    for (let j = 0; j < batch.length; j++) {
      const market = batch[j];
      for (const t of tradeArrays[j]) {
        const size = parseFloat(t.size);
        const price = parseFloat(t.price);
        if (isNaN(size) || isNaN(price)) continue;

        const usdValue = size * price;
        if (usdValue < WHALE_THRESHOLD_USD) continue;
        if (await isWhaleSeen(t.id)) continue;

        let ts = parseFloat(t.match_time);
        if (ts > 1e12) ts = Math.floor(ts / 1000);

        const trade: WhaleTrade = {
          id: t.id,
          marketTitle: market.question,
          marketSlug: market.slug,
          conditionId: market.conditionId,
          assetId: t.asset_id,
          outcome: t.outcome ?? "Yes",
          side: t.side,
          size,
          price,
          usdValue,
          traderAddress: t.owner ?? t.maker_address ?? "0x???",
          txHash: t.transaction_hash,
          timestamp: ts || Math.floor(Date.now() / 1000),
        };

        await saveWhaleTrade(trade);
        await markWhaleSeen(t.id);
        newWhales.push(trade);
      }
    }
  }

  const toAlert = [...newWhales].sort((a, b) => b.usdValue - a.usdValue).slice(0, 5);
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
