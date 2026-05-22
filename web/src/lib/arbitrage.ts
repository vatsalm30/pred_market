import fs from "fs";
import path from "path";
import type { ArbitrageOpportunity, MatchedMarket } from "./csv";

const KALSHI_BASE = "https://api.elections.kalshi.com/trade-api/v2";
const POLY_GAMMA = "https://gamma-api.polymarket.com/markets";
const KALSHI_BATCH = 200;
const POLY_BATCH = 50;
const MIN_OUTCOME_SCORE = 0.8;
const MIN_PROFIT_PCT = 1.0;

interface Price {
  yes_ask: number;
  no_ask: number;
}

async function fetchKalshiPrices(tickers: string[]): Promise<Record<string, Price>> {
  const out: Record<string, Price> = {};
  const headers: HeadersInit = {};
  if (process.env.KALSHI_API_KEY) {
    headers["Authorization"] = `Bearer ${process.env.KALSHI_API_KEY}`;
  }

  for (let i = 0; i < tickers.length; i += KALSHI_BATCH) {
    const batch = tickers.slice(i, i + KALSHI_BATCH);
    const url = `${KALSHI_BASE}/markets?tickers=${encodeURIComponent(batch.join(","))}`;
    try {
      const r = await fetch(url, { headers });
      if (!r.ok) {
        console.error(`Kalshi ${r.status} for batch ${i}`);
        continue;
      }
      const data = await r.json() as { markets?: KalshiMarket[] };
      for (const m of data.markets ?? []) {
        const yes = m.yes_ask_dollars;
        const no = m.no_ask_dollars;
        if (yes != null && no != null && m.ticker) {
          out[m.ticker] = { yes_ask: Number(yes), no_ask: Number(no) };
        }
      }
    } catch (e) {
      console.error("Kalshi fetch error", e);
    }
    if (i + KALSHI_BATCH < tickers.length) {
      await new Promise((res) => setTimeout(res, 300));
    }
  }
  return out;
}

async function fetchPolyPrices(ids: string[]): Promise<Record<string, Price>> {
  const out: Record<string, Price> = {};

  // Fire batches in parallel (poly gamma is fast and unauthenticated)
  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += POLY_BATCH) {
    batches.push(ids.slice(i, i + POLY_BATCH));
  }

  await Promise.all(
    batches.map(async (batch) => {
      const query = batch.map((id) => `id=${encodeURIComponent(id)}`).join("&");
      try {
        const r = await fetch(`${POLY_GAMMA}?${query}`);
        if (!r.ok) return;
        const data = (await r.json()) as PolyMarket[];
        for (const m of data) {
          const mid = String(m.id ?? "");
          if (!mid) continue;
          let prices = m.outcomePrices;
          if (typeof prices === "string") {
            try { prices = JSON.parse(prices); } catch { continue; }
          }
          if (Array.isArray(prices) && prices.length >= 2) {
            out[mid] = {
              yes_ask: Number(prices[0]),
              no_ask: Number(prices[1]),
            };
          }
        }
      } catch (e) {
        console.error("Poly batch error", e);
      }
    })
  );
  return out;
}

interface KalshiMarket {
  ticker?: string;
  yes_ask_dollars?: number | string;
  no_ask_dollars?: number | string;
}

interface PolyMarket {
  id?: string | number;
  outcomePrices?: string | (string | number)[];
}

export function computeOpportunities(
  matches: MatchedMarket[],
  kalshiPrices: Record<string, Price>,
  polyPrices: Record<string, Price>
): ArbitrageOpportunity[] {
  const opps: ArbitrageOpportunity[] = [];
  const ts = new Date().toISOString();

  for (const m of matches) {
    if ((m.outcome_score ?? 0) < MIN_OUTCOME_SCORE) continue;

    const kp = kalshiPrices[String(m.kalshi_market_id)];
    const pp = polyPrices[String(m.poly_market_id)];
    if (!kp || !pp) continue;

    const legs: Array<["yes" | "no", "yes" | "no", number, number]> = [
      ["yes", "no", kp.yes_ask, pp.no_ask],
      ["no", "yes", kp.no_ask, pp.yes_ask],
    ];

    for (const [kLeg, pLeg, kAsk, pAsk] of legs) {
      if (!(kAsk > 0 && kAsk < 1 && pAsk > 0 && pAsk < 1)) continue;
      const grossCost = kAsk + pAsk;
      const grossSpread = 1 - grossCost;
      const netProfitPct = grossCost > 0 ? ((1 - grossCost) * 100) / grossCost : 0;
      if (netProfitPct < MIN_PROFIT_PCT) continue;

      opps.push({
        timestamp: ts,
        kalshi_market_id: String(m.kalshi_market_id),
        poly_market_id: String(m.poly_market_id),
        poly_event: m.poly_event,
        kalshi_event: m.kalshi_event,
        poly_label: m.poly_label,
        kalshi_label: m.kalshi_label,
        event_score: m.event_score,
        outcome_score: m.outcome_score,
        kalshi_leg: kLeg,
        poly_leg: pLeg,
        kalshi_ask: kAsk,
        poly_ask: pAsk,
        gross_cost: Number(grossCost.toFixed(4)),
        gross_spread: Number(grossSpread.toFixed(4)),
        net_profit_pct: Number(netProfitPct.toFixed(4)),
        poly_url: m.poly_url ?? "",
        kalshi_url: m.kalshi_url ?? "",
        poly_end_date: m.poly_end_date,
        kalshi_end_date: m.kalshi_end_date,
        event_icon: m.event_icon,
        poly_volume: m.poly_volume,
        kalshi_volume: m.kalshi_volume,
      });
    }
  }

  return opps;
}

/**
 * Live arbitrage scan: reads matched_markets.json (static), pulls fresh prices
 * from Kalshi + Polymarket, and computes opportunities on the fly.
 */
export async function findLiveOpportunities(): Promise<{
  opportunities: ArbitrageOpportunity[];
  stats: { matches: number; kalshi_prices: number; poly_prices: number; duration_ms: number };
}> {
  const start = Date.now();

  const filePath = path.join(process.cwd(), "public", "data", "matched_markets.json");
  const raw = fs.readFileSync(filePath, "utf-8");
  const matches = JSON.parse(raw) as MatchedMarket[];

  const kalshiTickers = Array.from(
    new Set(matches.map((m) => String(m.kalshi_market_id)).filter(Boolean))
  );
  const polyIds = Array.from(
    new Set(matches.map((m) => String(m.poly_market_id)).filter(Boolean))
  );

  const [kalshiPrices, polyPrices] = await Promise.all([
    fetchKalshiPrices(kalshiTickers),
    fetchPolyPrices(polyIds),
  ]);

  const opportunities = computeOpportunities(matches, kalshiPrices, polyPrices);

  return {
    opportunities,
    stats: {
      matches: matches.length,
      kalshi_prices: Object.keys(kalshiPrices).length,
      poly_prices: Object.keys(polyPrices).length,
      duration_ms: Date.now() - start,
    },
  };
}
