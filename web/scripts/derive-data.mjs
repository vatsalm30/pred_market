// Builds small files from the big market data dumps so server pages never parse
// megabytes of JSON per request (Cloudflare Workers allow ~10 ms of CPU each).
// Runs before `next build`; output goes to public/data/derived/ (gitignored).
import fs from "node:fs";
import path from "node:path";

const DATA = path.join(process.cwd(), "public", "data");
const OUT = path.join(DATA, "derived");
const SHARDS = 64; // keep in sync with src/lib/shard.ts

// Same hash as shardOf() in src/lib/shard.ts
const shardOf = (id) => {
  let h = 5381;
  for (let i = 0; i < id.length; i++) h = ((h * 33) ^ id.charCodeAt(i)) >>> 0;
  return h % SHARDS;
};

const read = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), "utf8"));
const write = (f, v) => fs.writeFileSync(path.join(OUT, f), JSON.stringify(v));

fs.rmSync(OUT, { recursive: true, force: true });
for (const dir of ["events", "events-full", "pairs"]) fs.mkdirSync(path.join(OUT, dir), { recursive: true });

const events = read("all_events.json");
const matched = read("matched_markets.json");
const arbs = read("arbitrage_opportunities.json");

write("summary.json", {
  totalMarkets: events.length,
  matchedEvents: new Set(matched.map((r) => r.poly_event)).size,
  outcomePairs: matched.length,
  arbOpps: arbs.length,
  totalVolume: events.reduce((s, e) => s + (e.volume ?? 0), 0),
});

const shards = Array.from({ length: SHARDS }, () => ({}));
for (const e of events) {
  shards[shardOf(e.id)][e.id] = {
    title: e.title,
    platforms: e.platforms,
    yes_price_poly: e.yes_price_poly ?? null,
    yes_price_kalshi: e.yes_price_kalshi ?? null,
  };
}
shards.forEach((s, i) => write(`events/${i}.json`, s));

// Full event objects, so an event page loads ~170 KB instead of the whole dump
const fullShards = Array.from({ length: SHARDS }, () => ({}));
for (const e of events) fullShards[shardOf(e.id)][e.id] = e;
fullShards.forEach((s, i) => write(`events-full/${i}.json`, s));

// Everything about one Kalshi market: its matched rows, any open arbs and the parent event's id,
// keyed by Kalshi ticker
const eventIdByTitle = new Map(events.map((e) => [e.title, e.id]));
const pairShards = Array.from({ length: SHARDS }, () => ({}));
const entry = (id, event) =>
  (pairShards[shardOf(id)][id] ??= { matched: [], arbs: [], event_id: eventIdByTitle.get(event) ?? null });
for (const r of matched) entry(r.kalshi_market_id, r.poly_event).matched.push(r);
for (const o of arbs) entry(o.kalshi_market_id, o.poly_event).arbs.push(o);
pairShards.forEach((s, i) => write(`pairs/${i}.json`, s));

// Compact labels for every pair ("<kalshi ticker>:<poly id>", as the stream names them)
const pairsLite = {};
for (const r of matched) {
  pairsLite[`${r.kalshi_market_id}:${r.poly_market_id}`] = [r.poly_event, r.poly_label, r.kalshi_market_id, r.event_icon ?? null];
}
write("pairs-lite.json", pairsLite);


console.log(`derive-data: ${events.length} events, ${matched.length} pairs, ${arbs.length} arbs in ${SHARDS} shards`);
