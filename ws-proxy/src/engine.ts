import { EventEmitter } from "node:events";
import { emptyQuote, type Arb, type Leg, type Pair, type Quote } from "./types";
import type { TokenAsk } from "./polymarket";

export interface EngineOptions {
  minProfitPct: number;    // smallest gap tracked as an arb
  minOutcomeScore: number; // pairs matched below this are never reported as arbs
}

// Venues more than this far apart on the "same" question, or settling more than this many days
// apart, are almost always asking different questions (same rules as arbitrage.py); those pairs
// never open arbs.
const SUSPECT_GAP = 0.15;
const SUSPECT_DATE_DAYS = 45;

const daysApart = (a: string | null, b: string | null): number | null => {
  if (!a || !b) return null;
  const d = Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;
  return Number.isFinite(d) ? d : null;
};

/** Implied YES probability: midpoint of the YES ask and 1 − NO ask. */
const yesProb = (q: Quote): number | null =>
  q.yes_ask !== null && q.no_ask !== null ? (q.yes_ask + 1 - q.no_ask) / 2 : (q.yes_ask ?? (q.no_ask !== null ? 1 - q.no_ask : null));

/**
 * Joins live quotes from both venues onto matched pairs and tracks arbs.
 * Emits ("pair", pair_id) when either side of a pair moves, and
 * ("arb", "open" | "update" | "close", Arb) as arbs appear, change and vanish.
 * Profit uses the same formula as the batch pipeline (arbitrage.py), before fees.
 */
export class Engine extends EventEmitter {
  pairs = new Map<string, Pair>();
  arbs = new Map<string, Arb>();
  private kalshi = new Map<string, Quote>();
  private poly = new Map<string, Quote>(); // poly_market_id -> quote built from its two tokens
  private byTicker = new Map<string, string[]>();
  private byPolyId = new Map<string, string[]>();
  private byToken = new Map<string, { polyId: string; side: Leg }>();

  constructor(private opts: EngineOptions) {
    super();
  }

  setPairs(pairs: Pair[]) {
    this.pairs = new Map(pairs.map((p) => [p.pair_id, p]));
    this.byTicker.clear();
    this.byPolyId.clear();
    this.byToken.clear();
    for (const p of pairs) {
      push(this.byTicker, p.kalshi_ticker, p.pair_id);
      push(this.byPolyId, p.poly_market_id, p.pair_id);
      this.byToken.set(p.poly_yes_token, { polyId: p.poly_market_id, side: "YES" });
      this.byToken.set(p.poly_no_token, { polyId: p.poly_market_id, side: "NO" });
    }
    for (const [id, arb] of this.arbs) {
      if (!this.pairs.has(arb.pair_id)) {
        this.arbs.delete(id);
        this.emit("arb", "close", arb);
      }
    }
  }

  kalshiTickers(): string[] {
    return [...this.byTicker.keys()];
  }

  pairForTicker(ticker: string): Pair | undefined {
    const id = this.byTicker.get(ticker)?.[0];
    return id ? this.pairs.get(id) : undefined;
  }

  polyTokens(): string[] {
    return [...this.byToken.keys()];
  }

  quotes(pairId: string): { kalshi: Quote; polymarket: Quote } {
    const p = this.pairs.get(pairId)!;
    return {
      kalshi: this.kalshi.get(p.kalshi_ticker) ?? emptyQuote(),
      polymarket: this.poly.get(p.poly_market_id) ?? emptyQuote(),
    };
  }

  onKalshiQuote(ticker: string, q: Quote) {
    this.kalshi.set(ticker, q);
    for (const id of this.byTicker.get(ticker) ?? []) this.touch(id);
  }

  onPolyAsk(token: string, a: TokenAsk) {
    const t = this.byToken.get(token);
    if (!t) return;
    const q = { ...(this.poly.get(t.polyId) ?? emptyQuote()) };
    if (t.side === "YES") {
      q.yes_ask = a.ask;
      q.yes_ask_size = a.size;
    } else {
      q.no_ask = a.ask;
      q.no_ask_size = a.size;
    }
    q.exchange_ts = a.exchange_ts;
    q.recv_ts = a.recv_ts;
    this.poly.set(t.polyId, q);
    for (const id of this.byPolyId.get(t.polyId) ?? []) this.touch(id);
  }

  private touch(pairId: string) {
    this.emit("pair", pairId);
    const pair = this.pairs.get(pairId)!;
    const { kalshi: k, polymarket: p } = this.quotes(pairId);
    this.evaluate(pair, "YES", "NO", k.yes_ask, k.yes_ask_size, p.no_ask, p.no_ask_size, k, p);
    this.evaluate(pair, "NO", "YES", k.no_ask, k.no_ask_size, p.yes_ask, p.yes_ask_size, k, p);
  }

  private evaluate(
    pair: Pair,
    kalshiLeg: Leg,
    polyLeg: Leg,
    kalshiAsk: number | null,
    kalshiSize: number | null,
    polyAsk: number | null,
    polySize: number | null,
    k: Quote,
    p: Quote
  ) {
    const arbId = `${pair.pair_id}:${kalshiLeg}`;
    const prev = this.arbs.get(arbId);
    // A venue quoting both sides at an extreme has effectively settled: its "gaps" can't be traded
    const settled = (q: Quote) =>
      q.yes_ask !== null && q.no_ask !== null &&
      (q.yes_ask <= 0.01 || q.yes_ask >= 0.99) && (q.no_ask <= 0.01 || q.no_ask >= 0.99);
    const kp = yesProb(k), pp = yesProb(p);
    const suspect =
      (kp !== null && pp !== null && Math.abs(kp - pp) > SUSPECT_GAP) ||
      (daysApart(pair.poly_end_date, pair.kalshi_end_date) ?? 0) > SUSPECT_DATE_DAYS;
    const valid =
      pair.outcome_score >= this.opts.minOutcomeScore &&
      kalshiAsk !== null && polyAsk !== null &&
      kalshiAsk > 0 && kalshiAsk < 1 && polyAsk > 0 && polyAsk < 1 &&
      !settled(k) && !settled(p) && !suspect;
    const cost = valid ? kalshiAsk! + polyAsk! : 1;
    const pct = valid ? ((1 - cost) * 100) / cost : 0;

    if (!valid || pct < this.opts.minProfitPct) {
      if (prev) {
        this.arbs.delete(arbId);
        this.emit("arb", "close", { ...prev, updated_ts: Date.now() });
      }
      return;
    }

    const contracts = kalshiSize !== null && polySize !== null ? Math.min(kalshiSize, polySize) : null;
    const now = Date.now();
    const arb: Arb = {
      arb_id: arbId,
      pair_id: pair.pair_id,
      kalshi_leg: kalshiLeg,
      poly_leg: polyLeg,
      kalshi_ask: kalshiAsk!,
      poly_ask: polyAsk!,
      gross_cost: round(cost, 4),
      net_profit_pct: round(pct, 3),
      max_contracts: contracts === null ? null : round(contracts, 2),
      max_profit_usd: contracts === null ? null : round(contracts * (1 - cost), 2),
      kalshi_ts: k.exchange_ts,
      poly_ts: p.exchange_ts,
      opened_ts: prev?.opened_ts ?? now,
      updated_ts: now,
    };
    if (prev && prev.gross_cost === arb.gross_cost && prev.max_contracts === arb.max_contracts) return;
    this.arbs.set(arbId, arb);
    this.emit("arb", prev ? "update" : "open", arb);
  }
}

function push(map: Map<string, string[]>, key: string, value: string) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp;
