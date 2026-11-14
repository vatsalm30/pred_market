import fs from "fs/promises";
import path from "path";
import { getCloudflareContext } from "@opennextjs/cloudflare";

// Reads a file under public/data. On Cloudflare Workers there is no filesystem,
// so the file is fetched from the static assets binding instead.
// Large dumps are pre-split by scripts/derive-data.mjs into public/data/derived/.

import { shardOf } from "./shard";

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


export const getHomeStats = () => readData<HomeStats>("derived/summary.json");

export async function getEventMeta(id: string): Promise<EventMeta | null> {
  const shard = await readData<Record<string, EventMeta>>(`derived/events/${shardOf(id)}.json`);
  return shard[id] ?? null;
}

