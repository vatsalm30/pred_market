import type { ArbitrageOpportunity } from "./csv";

// Lazy-initialise the Redis client so the module is safe to import even when
// env vars are absent (e.g. during a static build step).
let _redis: import("@upstash/redis").Redis | null = null;

function redis() {
  if (!_redis) {
    const { Redis } = require("@upstash/redis");
    _redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    }) as import("@upstash/redis").Redis;
  }
  return _redis!;
}

const SUB_PREFIX = "bot:subscriber:";
const SEEN_PREFIX = "bot:seen:";
const SEEN_TTL = 86_400; // 24 h
const RECENT_ALERTS_KEY = "bot:recent_alerts";
const LAST_SCAN_KEY = "bot:last_scan";
const RECENT_ALERTS_CAP = 25;

export function oppKey(o: ArbitrageOpportunity): string {
  return `${o.kalshi_market_id}:${o.poly_market_id}:${o.kalshi_leg}:${o.poly_leg}`;
}

export async function addSubscriber(
  chatId: number,
  username?: string
): Promise<void> {
  await redis().hset(`${SUB_PREFIX}${chatId}`, {
    chatId: String(chatId),
    username: username ?? "",
    joinedAt: new Date().toISOString(),
  });
}

export async function removeSubscriber(chatId: number): Promise<void> {
  await redis().del(`${SUB_PREFIX}${chatId}`);
}

export async function getSubscriberIds(): Promise<number[]> {
  const ids: number[] = [];
  let cursor = 0;
  do {
    const [next, keys] = await redis().scan(cursor, {
      match: `${SUB_PREFIX}*`,
      count: 100,
    });
    cursor = Number(next);
    for (const key of keys as string[]) {
      const id = Number(key.replace(SUB_PREFIX, ""));
      if (!isNaN(id)) ids.push(id);
    }
  } while (cursor !== 0);
  return ids;
}

/**
 * Mark an opportunity as seen. Returns true if this is the first time we're
 * seeing it (i.e. it should be sent), false if already seen.
 */
export async function markSeen(key: string): Promise<boolean> {
  const result = await redis().set(`${SEEN_PREFIX}${key}`, "1", {
    nx: true,
    ex: SEEN_TTL,
  });
  return result !== null;
}

export interface RecentAlert {
  ts: string;
  poly_event: string;
  poly_label: string;
  kalshi_label: string;
  kalshi_leg: string;
  poly_leg: string;
  kalshi_ask: number;
  poly_ask: number;
  net_profit_pct: number;
  poly_url: string;
  kalshi_url: string;
}

export async function recordAlerts(opps: ArbitrageOpportunity[]): Promise<void> {
  if (opps.length === 0) return;
  const entries = opps.map((o) =>
    JSON.stringify({
      ts: new Date().toISOString(),
      poly_event: o.poly_event,
      poly_label: o.poly_label,
      kalshi_label: o.kalshi_label,
      kalshi_leg: o.kalshi_leg,
      poly_leg: o.poly_leg,
      kalshi_ask: o.kalshi_ask,
      poly_ask: o.poly_ask,
      net_profit_pct: o.net_profit_pct,
      poly_url: o.poly_url,
      kalshi_url: o.kalshi_url,
    } satisfies RecentAlert)
  );
  // LPUSH newest first, then LTRIM to cap
  await redis().lpush(RECENT_ALERTS_KEY, ...entries);
  await redis().ltrim(RECENT_ALERTS_KEY, 0, RECENT_ALERTS_CAP - 1);
}

export async function getRecentAlerts(limit = 25): Promise<RecentAlert[]> {
  const items = await redis().lrange(RECENT_ALERTS_KEY, 0, Math.max(0, limit - 1));
  return (items as (string | RecentAlert)[])
    .map((raw) => {
      if (typeof raw === "string") {
        try { return JSON.parse(raw) as RecentAlert; } catch { return null; }
      }
      return raw;
    })
    .filter((x): x is RecentAlert => x !== null);
}

export async function setLastScan(): Promise<void> {
  await redis().set(LAST_SCAN_KEY, new Date().toISOString());
}

export async function getLastScan(): Promise<string | null> {
  return (await redis().get<string>(LAST_SCAN_KEY)) ?? null;
}

export function formatAlert(o: ArbitrageOpportunity): string {
  const kalshiCents = (o.kalshi_ask * 100).toFixed(1);
  const polyCents = (o.poly_ask * 100).toFixed(1);
  const profit = o.net_profit_pct.toFixed(1);
  const est500 = ((o.net_profit_pct / 100) * 500).toFixed(0);
  const est1000 = ((o.net_profit_pct / 100) * 1000).toFixed(0);

  const eventLine = o.poly_event.length > 60
    ? o.poly_event.slice(0, 57) + "..."
    : o.poly_event;

  return (
    `🔔 <b>Arbitrage Alert</b>\n\n` +
    `<b>Event:</b> ${escapeHtml(eventLine)}\n\n` +
    `<b>Kalshi:</b> ${escapeHtml(o.kalshi_label)} (${o.kalshi_leg.toUpperCase()}) @ ${kalshiCents}¢\n` +
    `<b>Poly:</b>   ${escapeHtml(o.poly_label)} (${o.poly_leg.toUpperCase()}) @ ${polyCents}¢\n\n` +
    `<b>Gross cost:</b> ${o.gross_cost.toFixed(3)}  →  <b>Profit:</b> ${profit}%\n` +
    `Est. profit: <b>$${est500}</b> on $500 · <b>$${est1000}</b> on $1,000\n\n` +
    `<a href="${o.kalshi_url}">Kalshi</a> · <a href="${o.poly_url}">Polymarket</a>`
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Send a message to a single chat via the Bot API (no Telegraf dependency).
 * Returns false if the user blocked/deleted the bot (403 or bot was kicked).
 */
export async function sendMessage(
  chatId: number,
  text: string
): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN!;
  const res = await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    }
  );
  if (res.ok) return true;
  const body = await res.json().catch(() => ({})) as { error_code?: number };
  // 403 = bot was blocked; 400 with "chat not found" = user deleted account
  if (body.error_code === 403 || body.error_code === 400) return false;
  return true;
}
