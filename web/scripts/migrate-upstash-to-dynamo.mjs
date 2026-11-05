/**
 * One-off copy of all Upstash Redis data into the DynamoDB table (see src/lib/db.ts
 * for the item layout). Safe to re-run: every write is an idempotent put.
 *
 * Reads UPSTASH_REDIS_REST_URL / _TOKEN from web/.env and uses your local AWS
 * CLI credentials for DynamoDB.
 *
 * Usage: node scripts/migrate-upstash-to-dynamo.mjs
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envVars = Object.fromEntries(
  readFileSync(resolve(__dirname, "../.env"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).replace(/^["']|["']$/g, "").trim()])
);

const URL_ = envVars.UPSTASH_REDIS_REST_URL;
const TOKEN = envVars.UPSTASH_REDIS_REST_TOKEN;
const TABLE = process.env.DYNAMODB_TABLE ?? "omnipred";
const db = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.AWS_REGION ?? "us-east-1" }),
  { marshallOptions: { removeUndefinedValues: true } }
);

async function redis(...cmd) {
  const res = await fetch(URL_, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(cmd),
  });
  const json = await res.json();
  if (json.error) throw new Error(`${cmd[0]}: ${json.error}`);
  return json.result;
}

async function scanKeys(match) {
  const keys = [];
  let cursor = "0";
  do {
    const [next, batch] = await redis("SCAN", cursor, "MATCH", match, "COUNT", "500");
    cursor = String(next);
    keys.push(...batch);
  } while (cursor !== "0");
  return keys;
}

const put = (Item) => db.send(new PutCommand({ TableName: TABLE, Item }));
const parse = (raw) => (typeof raw === "string" ? JSON.parse(raw) : raw);
const nowSec = () => Math.floor(Date.now() / 1000);

/** Expiry as unix seconds, or undefined if the key has no TTL. */
async function expiry(key) {
  const ttl = await redis("TTL", key);
  return ttl > 0 ? nowSec() + ttl : undefined;
}

// Subscribers
const subKeys = await scanKeys("bot:subscriber:*");
for (const key of subKeys) {
  const flat = await redis("HGETALL", key);
  const h = {};
  for (let i = 0; i < flat.length; i += 2) h[flat[i]] = flat[i + 1];
  await put({ pk: "sub", sk: key.slice("bot:subscriber:".length), ...h });
}
console.log(`subscribers: ${subKeys.length}`);

// Blog posts + news stories (sorted-set index holds the score)
for (const [kind, prefix] of [["blog", "blog:post:"], ["news", "news:story:"]]) {
  const flat = await redis("ZRANGE", `${kind}:index`, "0", "-1", "WITHSCORES");
  let n = 0;
  for (let i = 0; i < flat.length; i += 2) {
    const raw = await redis("GET", `${prefix}${flat[i]}`);
    if (!raw) continue;
    await put({ pk: kind, sk: flat[i], score: Number(flat[i + 1]), data: parse(raw) });
    n++;
  }
  console.log(`${kind}: ${n}`);
}

// Whale trades
const whaleIds = await redis("ZRANGE", "whale:index", "0", "-1");
let whales = 0;
for (const id of whaleIds) {
  const raw = await redis("GET", `whale:trade:${id}`);
  if (!raw) continue;
  const trade = parse(raw);
  const sk = `${String(trade.timestamp).padStart(12, "0")}#${trade.id}`;
  await put({ pk: "whale", sk, ttl: nowSec() + 14 * 86400, data: trade });
  whales++;
}
console.log(`whale trades: ${whales}`);

// Dedupe markers, so subscribers don't get re-alerted for opportunities already sent
for (const [match, prefix, pk] of [["bot:seen:*", "bot:seen:", "seen#"], ["whale:seen:*", "whale:seen:", "whaleseen#"]]) {
  const keys = await scanKeys(match);
  for (const key of keys) {
    await put({ pk: `${pk}${key.slice(prefix.length)}`, sk: "_", ttl: (await expiry(key)) ?? nowSec() + 86400 });
  }
  console.log(`${match}: ${keys.length}`);
}

// Recent alerts feed (LPUSH'd newest first)
const alerts = (await redis("LRANGE", "bot:recent_alerts", "0", "-1")).map(parse);
for (const [n, alert] of alerts.entries()) {
  await put({ pk: "alert", sk: `${alert.ts}#${String(n).padStart(4, "0")}`, ttl: nowSec() + 7 * 86400, alert });
}
console.log(`recent alerts: ${alerts.length}`);

const lastScan = await redis("GET", "bot:last_scan");
if (lastScan) await put({ pk: "meta", sk: "last_scan", value: lastScan });

console.log("done");
