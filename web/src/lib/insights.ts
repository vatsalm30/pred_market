import { GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { db, TABLE, nowSec } from "./db";
import { readData } from "./staticData";

// Data the stream service (ws-proxy) computes from the live feeds and posts here:
//   hist#<pairId> / <hour ISO>    implied YES probability on each venue, hourly (ttl 35d)
//   snap / <hour ISO>             every pair's probabilities for one hour, for movers (ttl 3d)
//   arbstats / <date>             how long arbs stayed open that day, by profit tier

export interface HistoryPoint {
  t: string; // hour, ISO
  k: number | null; // Kalshi implied YES probability
  p: number | null; // Polymarket implied YES probability
}

const HISTORY_TTL = 35 * 86400;
const SNAP_TTL = 3 * 86400;

/** Writes up to 25 hourly points (single puts: the site's IAM user has no BatchWriteItem). */
export async function saveHistory(hour: string, points: { pair: string; k: number | null; p: number | null }[]) {
  const results = await Promise.allSettled(
    points.slice(0, 25).map((pt) =>
      db().send(new PutCommand({ TableName: TABLE, Item: { pk: `hist#${pt.pair}`, sk: hour, k: pt.k, p: pt.p, ttl: nowSec() + HISTORY_TTL } }))
    )
  );
  return results.filter((r) => r.status === "fulfilled").length;
}

export async function getHistory(pairId: string, days: number): Promise<HistoryPoint[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const res = await db().send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "pk = :pk AND sk >= :since",
      ExpressionAttributeValues: { ":pk": `hist#${pairId}`, ":since": since },
    })
  );
  return (res.Items ?? []).map((i) => ({ t: String(i.sk), k: (i.k as number) ?? null, p: (i.p as number) ?? null }));
}

export async function saveSnapshot(hour: string, prices: Record<string, [number | null, number | null]>) {
  await db().send(new PutCommand({ TableName: TABLE, Item: { pk: "snap", sk: hour, prices, ttl: nowSec() + SNAP_TTL } }));
}

async function snapshotAtOrBefore(iso: string): Promise<{ hour: string; prices: Record<string, [number | null, number | null]> } | null> {
  const res = await db().send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "pk = :pk AND sk <= :t",
      ExpressionAttributeValues: { ":pk": "snap", ":t": iso },
      ScanIndexForward: false,
      Limit: 1,
    })
  );
  const item = res.Items?.[0];
  return item ? { hour: String(item.sk), prices: item.prices as Record<string, [number | null, number | null]> } : null;
}

export interface Mover {
  pair_id: string;
  kalshi_market_id: string;
  event: string;
  label: string;
  icon: string | null;
  from: number; // probability 24h ago
  to: number;   // probability now
  change: number; // percentage points
}

const avg = ([k, p]: [number | null, number | null]) => (k !== null && p !== null ? (k + p) / 2 : (k ?? p));

let moversCache: { at: number; value: { hour: string | null; movers: Mover[] } } | null = null;

/** Pairs whose cross-venue probability moved most over the last 24 hours. */
export async function getMovers(limit = 10): Promise<{ hour: string | null; movers: Mover[] }> {
  if (moversCache && Date.now() - moversCache.at < 10 * 60_000) return moversCache.value;
  const now = await snapshotAtOrBefore(new Date().toISOString());
  if (!now) return { hour: null, movers: [] };
  const then = await snapshotAtOrBefore(new Date(Date.parse(now.hour) - 24 * 3_600_000).toISOString());
  if (!then) return { hour: now.hour, movers: [] };

  const labels = await readData<Record<string, [string, string, string, string | null]>>("derived/pairs-lite.json");
  const movers: Mover[] = [];
  for (const [id, cur] of Object.entries(now.prices)) {
    const prev = then.prices[id];
    const meta = labels[id];
    if (!prev || !meta) continue;
    const a = avg(prev), b = avg(cur);
    if (a === null || b === null) continue;
    movers.push({
      pair_id: id,
      event: meta[0],
      label: meta[1],
      kalshi_market_id: meta[2],
      icon: meta[3],
      from: a,
      to: b,
      change: Math.round((b - a) * 1000) / 10,
    });
  }
  movers.sort((x, y) => Math.abs(y.change) - Math.abs(x.change));
  const value = { hour: now.hour, movers: movers.filter((m) => m.change !== 0).slice(0, limit) };
  moversCache = { at: Date.now(), value };
  return value;
}

// ── Arb lifetimes ───────────────────────────────────────────────────────────

export const LIFETIME_BUCKETS = ["Under 10s", "10s–1m", "1–5m", "5–30m", "30m–2h", "2–12h", "12h+"];
export const PROFIT_TIERS = { lt2: "Under 2%", "2to5": "2–5%", "5plus": "5% or more" } as const;
export type Tier = keyof typeof PROFIT_TIERS;
export interface TierStats { n: number; sum_s: number; buckets: number[] }
export type DayStats = Record<Tier, TierStats>;

export async function saveArbStats(date: string, stats: DayStats) {
  await db().send(new PutCommand({ TableName: TABLE, Item: { pk: "arbstats", sk: date, stats } }));
}

export async function getArbStats(date: string): Promise<DayStats | null> {
  const res = await db().send(new GetCommand({ TableName: TABLE, Key: { pk: "arbstats", sk: date } }));
  return (res.Item?.stats as DayStats | undefined) ?? null;
}

export async function getArbStatsSince(days: number): Promise<{ date: string; stats: DayStats }[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const res = await db().send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "pk = :pk AND sk >= :since",
      ExpressionAttributeValues: { ":pk": "arbstats", ":since": since },
    })
  );
  return (res.Items ?? []).map((i) => ({ date: String(i.sk), stats: i.stats as DayStats }));
}
