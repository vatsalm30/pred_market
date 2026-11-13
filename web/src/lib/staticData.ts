import fs from "fs/promises";
import path from "path";
import { getCloudflareContext } from "@opennextjs/cloudflare";

// Reads a file under public/data. On Cloudflare Workers there is no filesystem,
// so the file is fetched from the static assets binding instead.
// Large dumps are pre-split by scripts/derive-data.mjs into public/data/derived/.

const SHARDS = 64; // keep in sync with scripts/derive-data.mjs

export const shardOf = (id: string) => {
  let h = 5381;
  for (let i = 0; i < id.length; i++) h = ((h * 33) ^ id.charCodeAt(i)) >>> 0;
  return h % SHARDS;
};

const onWorkers = () => typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";

export async function readData<T>(file: string): Promise<T> {
  if (onWorkers()) {
    const { env } = await getCloudflareContext({ async: true });
    const res = await env.ASSETS.fetch(`https://assets.local/data/${file}`);
    if (!res.ok) throw new Error(`data/${file}: ${res.status}`);
    return (await res.json()) as T;
  }
  return JSON.parse(await fs.readFile(path.join(process.cwd(), "public", "data", file), "utf8")) as T;
}

export interface HomeStats {
  totalMarkets: number;
  matchedEvents: number;
  outcomePairs: number;
  arbOpps: number;
  totalVolume: number;
}

export interface EventMeta {
  title: string;
  platforms: string[];
  yes_price_poly: number | null;
  yes_price_kalshi: number | null;
}

export interface ArbMeta {
  poly_label: string;
  poly_event: string;
  net_profit_pct: number;
  kalshi_leg: string;
  poly_leg: string;
  kalshi_ask: number;
  poly_ask: number;
}

export const getHomeStats = () => readData<HomeStats>("derived/summary.json");

export async function getEventMeta(id: string): Promise<EventMeta | null> {
  const shard = await readData<Record<string, EventMeta>>(`derived/events/${shardOf(id)}.json`);
  return shard[id] ?? null;
}

export async function getArbMeta(kalshiMarketId: string): Promise<ArbMeta | null> {
  const all = await readData<Record<string, ArbMeta>>("derived/arbs.json");
  return all[kalshiMarketId] ?? null;
}
