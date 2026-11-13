// Builds small files from the big market data dumps so server pages never parse
// megabytes of JSON per request (Cloudflare Workers allow ~10 ms of CPU each).
// Runs before `next build`; output goes to public/data/derived/ (gitignored).
import fs from "node:fs";
import path from "node:path";

const DATA = path.join(process.cwd(), "public", "data");
const OUT = path.join(DATA, "derived");
const SHARDS = 64; // keep in sync with src/lib/staticData.ts

// Same hash as shardOf() in src/lib/staticData.ts
const shardOf = (id) => {
  let h = 5381;
  for (let i = 0; i < id.length; i++) h = ((h * 33) ^ id.charCodeAt(i)) >>> 0;
  return h % SHARDS;
};

const read = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), "utf8"));
const write = (f, v) => fs.writeFileSync(path.join(OUT, f), JSON.stringify(v));

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, "events"), { recursive: true });

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

const arbMeta = {};
for (const o of arbs) {
  arbMeta[o.kalshi_market_id] ??= {
    poly_label: o.poly_label,
    poly_event: o.poly_event,
    net_profit_pct: o.net_profit_pct,
    kalshi_leg: o.kalshi_leg,
    poly_leg: o.poly_leg,
    kalshi_ask: o.kalshi_ask,
    poly_ask: o.poly_ask,
  };
}
write("arbs.json", arbMeta);

console.log(`derive-data: ${events.length} events in ${SHARDS} shards, ${Object.keys(arbMeta).length} arbs`);
