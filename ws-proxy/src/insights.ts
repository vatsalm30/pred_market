import type { Engine } from "./engine";
import type { KalshiFeed, KalshiTrade } from "./kalshi";
import type { Site } from "./site";
import type { Arb, Pair, Quote } from "./types";

/**
 * Derived data the website shows, computed from the live feeds and sent to the
 * site's /api/stream/* endpoints:
 *  - hourly implied probabilities per pair (price charts) and a full snapshot (biggest movers)
 *  - large Kalshi trades (whale tracker)
 *  - how long arbs stay open, aggregated per UTC day (gap stats)
 *  - new, durable arbs for Discord alerts, and watchlist rule triggers
 *  - a once-a-day trigger for the daily digest
 */

export interface InsightsOptions {
  kalshiWhaleUsd: number; // smallest Kalshi trade reported as a whale trade
  dailyHourUtc: number;   // hour the daily digest goes out
}

const HOUR = 3_600_000;
const ALERT_MIN_OPEN_MS = 30_000;    // ignore arbs that flicker shut within seconds
const ALERT_COOLDOWN_MS = 6 * HOUR;  // per arb (Discord) and per rule (watchlist gap alerts)
const MAX_END_DATE_GAP_DAYS = 7;     // wider than this and the two markets likely resolve differently
const MIN_OUTCOME_SCORE = 0.9;

// Same fee estimate as the website (web/src/lib/fees.ts)
const KALSHI_FEE_RATE = 0.07;
const POLY_FEE_RATE = 0.05;
export function netAfterFeesPct(k: number, p: number): number {
  const cost = k + p + KALSHI_FEE_RATE * k * (1 - k) + POLY_FEE_RATE * p * (1 - p);
  return ((1 - cost) / cost) * 100;
}

/** Market-implied YES probability: midpoint of the YES ask and 1 − NO ask. */
export function yesProb(q: Quote): number | null {
  const { yes_ask: a, no_ask: b } = q;
  if (a !== null && b !== null) return (a + 1 - b) / 2;
  if (a !== null) return a;
  if (b !== null) return 1 - b;
  return null;
}

// Arb lifetime buckets, in seconds: <10s, <1m, <5m, <30m, <2h, <12h, 12h+
const BUCKET_EDGES = [10, 60, 300, 1800, 7200, 43200];
type Tier = "lt2" | "2to5" | "5plus";
interface TierStats { n: number; sum_s: number; buckets: number[] }
type DayStats = Record<Tier, TierStats>;
const emptyDay = (): DayStats => ({
  lt2: { n: 0, sum_s: 0, buckets: Array(BUCKET_EDGES.length + 1).fill(0) },
  "2to5": { n: 0, sum_s: 0, buckets: Array(BUCKET_EDGES.length + 1).fill(0) },
  "5plus": { n: 0, sum_s: 0, buckets: Array(BUCKET_EDGES.length + 1).fill(0) },
});

interface Rule {
  key: string;
  pair_id: string;
  move: number | null; // percentage points
  gap: number | null;  // profit %
  base: number | null; // probability the move is measured from
  last_gap_ts: number | null;
}

const round3 = (n: number | null) => (n === null ? null : Math.round(n * 1000) / 1000);
const utcDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class Insights {
  private maxPct = new Map<string, number>();
  private days = new Map<string, DayStats>();
  private dirtyDays = new Set<string>();
  private whales: object[] = [];
  private pendingAlerts = new Set<string>();
  private alerted = new Map<string, number>();
  private rules: Rule[] = [];
  private lastDaily = "";

  constructor(private engine: Engine, private kalshi: KalshiFeed, private site: Site, private opts: InsightsOptions) {}

  async start() {
    if (!this.site.enabled) return console.warn("insights: site endpoint not configured — disabled");
    this.engine.on("arb", (event: string, arb: Arb) => this.onArb(event, arb));
    this.kalshi.on("trade", (t: KalshiTrade) => this.onTrade(t));

    await this.seedStats();
    const every = (ms: number, fn: () => Promise<void>) =>
      setInterval(() => fn().catch((e) => console.error("insights:", e instanceof Error ? e.message : e)), ms);
    every(30_000, () => this.flushWhales());
    every(60_000, () => this.flushAlerts());
    every(10 * 60_000, () => this.flushStats());
    every(5 * 60_000, () => this.loadRules());
    every(30_000, () => this.checkRules());
    every(5 * 60_000, () => this.maybeDaily());
    this.loadRules().catch(() => {});
    setTimeout(() => this.maybeDaily().catch((e) => console.error("insights: daily", e)), 60_000);
    // One snapshot shortly after start so a restart doesn't leave a hole until the next hour
    setTimeout(() => this.recordHour().catch((e) => console.error("insights: history", e)), 2 * 60_000);

    // Price history on the hour (a minute past, once quotes have settled after any reconnect)
    const untilNextHour = HOUR - (Date.now() % HOUR) + 60_000;
    setTimeout(() => {
      this.recordHour().catch((e) => console.error("insights: history", e));
      every(HOUR, () => this.recordHour());
    }, untilNextHour);
  }

  // ── Pair helpers ──────────────────────────────────────────────────────────

  private probs(pairId: string): [number | null, number | null] {
    const { kalshi, polymarket } = this.engine.quotes(pairId);
    return [round3(yesProb(kalshi)), round3(yesProb(polymarket))];
  }

  private describe(arb: Arb) {
    const p = this.engine.pairs.get(arb.pair_id) as Pair;
    return {
      ...arb,
      net_after_fees_pct: Math.round(netAfterFeesPct(arb.kalshi_ask, arb.poly_ask) * 100) / 100,
      poly_event: p.poly_event,
      poly_label: p.poly_label,
      kalshi_label: p.kalshi_label,
      poly_url: p.poly_url,
      kalshi_url: p.kalshi_url,
      kalshi_ticker: p.kalshi_ticker,
      poly_end_date: p.poly_end_date,
      kalshi_end_date: p.kalshi_end_date,
    };
  }

  /** Arbs worth telling people about: well matched, same deadline, profitable after fees. */
  private qualifies(arb: Arb): boolean {
    const p = this.engine.pairs.get(arb.pair_id);
    if (!p || p.outcome_score < MIN_OUTCOME_SCORE) return false;
    if (p.poly_end_date && p.kalshi_end_date) {
      const days = Math.abs(Date.parse(p.poly_end_date) - Date.parse(p.kalshi_end_date)) / 86_400_000;
      if (!(days <= MAX_END_DATE_GAP_DAYS)) return false;
    }
    return netAfterFeesPct(arb.kalshi_ask, arb.poly_ask) > 0.5;
  }

  // ── Price history ─────────────────────────────────────────────────────────

  private async recordHour() {
    const hour = new Date(Math.floor(Date.now() / HOUR) * HOUR).toISOString();
    const prices: Record<string, [number | null, number | null]> = {};
    for (const id of this.engine.pairs.keys()) {
      const pr = this.probs(id);
      if (pr[0] !== null || pr[1] !== null) prices[id] = pr;
    }
    await this.site.post("/ingest", { kind: "snapshot", hour, prices });
    const points = Object.entries(prices).map(([pair, [k, p]]) => ({ pair, k, p }));
    // 25 per request (one DynamoDB batch), spaced out to stay inside the table's write capacity
    for (let i = 0; i < points.length; i += 25) {
      await this.site.post("/ingest", { kind: "history", hour, points: points.slice(i, i + 25) });
      await sleep(2_000);
    }
    console.log(`insights: recorded ${points.length} prices for ${hour}`);
  }

  // ── Kalshi whale trades ───────────────────────────────────────────────────

  private onTrade(t: KalshiTrade) {
    const usd = t.price * t.count;
    if (usd < this.opts.kalshiWhaleUsd) return;
    const pair = this.engine.pairForTicker(t.ticker);
    this.whales.push({
      id: t.id,
      ticker: t.ticker,
      title: pair ? `${pair.kalshi_label}` : t.ticker,
      event: pair?.poly_event ?? null,
      url: pair?.kalshi_url ?? null,
      side: t.side,
      price: t.price,
      count: t.count,
      usd: Math.round(usd * 100) / 100,
      ts: t.ts,
    });
  }

  private async flushWhales() {
    if (this.whales.length === 0) return;
    const batch = this.whales.splice(0, 50);
    try {
      await this.site.post("/ingest", { kind: "kalshi_trades", trades: batch });
    } catch (e) {
      if (this.whales.length < 500) this.whales.unshift(...batch);
      throw e;
    }
  }

  // ── Arb lifetimes and Discord alerts ──────────────────────────────────────

  private onArb(event: string, arb: Arb) {
    if (event === "open" || event === "update") {
      this.maxPct.set(arb.arb_id, Math.max(this.maxPct.get(arb.arb_id) ?? 0, arb.net_profit_pct));
      if (event === "open") this.pendingAlerts.add(arb.arb_id);
      return;
    }
    // close
    const max = this.maxPct.get(arb.arb_id) ?? arb.net_profit_pct;
    this.maxPct.delete(arb.arb_id);
    const secs = Math.max(0, (arb.updated_ts - arb.opened_ts) / 1000);
    const tier: Tier = max < 2 ? "lt2" : max < 5 ? "2to5" : "5plus";
    const date = utcDate(arb.updated_ts);
    const day = this.days.get(date) ?? emptyDay();
    this.days.set(date, day);
    const t = day[tier];
    t.n++;
    t.sum_s += secs;
    const bucket = BUCKET_EDGES.findIndex((e) => secs < e);
    t.buckets[bucket === -1 ? BUCKET_EDGES.length : bucket]++;
    this.dirtyDays.add(date);
  }

  private async seedStats() {
    const date = utcDate(Date.now());
    try {
      const res = await this.site.get<{ stats: DayStats | null }>(`/arbstats?date=${date}`);
      if (res.stats) this.days.set(date, res.stats);
    } catch (e) {
      console.error("insights: couldn't load today's gap stats:", e instanceof Error ? e.message : e);
    }
  }

  private async flushStats() {
    const dates = [...this.dirtyDays];
    this.dirtyDays.clear();
    for (const date of dates) {
      try {
        await this.site.post("/ingest", { kind: "arbstats", date, stats: this.days.get(date) });
      } catch (e) {
        this.dirtyDays.add(date);
        throw e;
      }
    }
    // Keep only today and yesterday in memory
    const keep = new Set([utcDate(Date.now()), utcDate(Date.now() - 86_400_000)]);
    for (const d of this.days.keys()) if (!keep.has(d)) this.days.delete(d);
  }

  private async flushAlerts() {
    const now = Date.now();
    for (const [id, ts] of this.alerted) if (now - ts > ALERT_COOLDOWN_MS) this.alerted.delete(id);
    const ready: Arb[] = [];
    for (const id of this.pendingAlerts) {
      const arb = this.engine.arbs.get(id);
      if (!arb) this.pendingAlerts.delete(id);
      else if (now - arb.opened_ts >= ALERT_MIN_OPEN_MS) {
        this.pendingAlerts.delete(id);
        if (!this.alerted.has(id) && this.qualifies(arb)) ready.push(arb);
      }
    }
    if (ready.length === 0) return;
    const top = ready.sort((a, b) => b.net_profit_pct - a.net_profit_pct).slice(0, 10);
    await this.site.post("/alerts", { arbs: top.map((a) => this.describe(a)) });
    for (const a of top) this.alerted.set(a.arb_id, now);
  }

  // ── Watchlist rules ───────────────────────────────────────────────────────

  private async loadRules() {
    const res = await this.site.get<{ rules: Rule[] }>("/rules");
    this.rules = res.rules ?? [];
  }

  private async checkRules() {
    const now = Date.now();
    const triggers: object[] = [];
    for (const r of this.rules) {
      if (!this.engine.pairs.has(r.pair_id)) continue;
      const [k, p] = this.probs(r.pair_id);
      const prob = k !== null && p !== null ? (k + p) / 2 : (k ?? p);
      if (r.move !== null && prob !== null) {
        if (r.base === null) {
          r.base = prob;
          triggers.push({ key: r.key, kind: "base", to: round3(prob) });
        } else if (Math.abs(prob - r.base) * 100 >= r.move) {
          triggers.push({ key: r.key, kind: "move", from: r.base, to: round3(prob), kalshi: k, polymarket: p });
          r.base = prob;
        }
      }
      if (r.gap !== null && (r.last_gap_ts === null || now - r.last_gap_ts > ALERT_COOLDOWN_MS)) {
        const best = (["YES", "NO"] as const)
          .map((leg) => this.engine.arbs.get(`${r.pair_id}:${leg}`))
          .filter((a): a is Arb => !!a && a.net_profit_pct >= r.gap!)
          .sort((a, b) => b.net_profit_pct - a.net_profit_pct)[0];
        if (best) {
          triggers.push({ key: r.key, kind: "gap", arb: this.describe(best) });
          r.last_gap_ts = now;
        }
      }
    }
    if (triggers.length) await this.site.post("/notify", { triggers });
  }

  // ── Daily digest ──────────────────────────────────────────────────────────

  private async maybeDaily() {
    const now = new Date();
    const date = utcDate(now.getTime());
    if (now.getUTCHours() < this.opts.dailyHourUtc || this.lastDaily === date) return;
    const top = [...this.engine.arbs.values()]
      .filter((a) => this.qualifies(a))
      .sort((a, b) => netAfterFeesPct(b.kalshi_ask, b.poly_ask) - netAfterFeesPct(a.kalshi_ask, a.poly_ask))
      .slice(0, 5)
      .map((a) => this.describe(a));
    await this.site.post("/daily", { date, top_arbs: top });
    this.lastDaily = date;
  }
}
