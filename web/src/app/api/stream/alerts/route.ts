import { NextRequest, NextResponse } from "next/server";
import { fromStream } from "@/lib/streamAuth";
import { allSettings, saveSettings } from "@/lib/alerts";
import { arbEmbed, postDiscord, type StreamArb } from "@/lib/notify";
import { formatAlert, getSubscriberIds, markSeen, oppKey, recordAlerts, removeSubscriber, sendMessage } from "@/lib/bot";
import type { ArbitrageOpportunity } from "@/lib/csv";

export const dynamic = "force-dynamic";

// Workers allow 50 outbound requests per invocation, shared by Discord, Telegram and the database.
const MAX_WEBHOOKS = 20;
const MAX_TELEGRAM_MESSAGES = 15;
const TELEGRAM_MIN_PROFIT_PCT = 2;
const TELEGRAM_MAX_ARBS = 3;

/** The batch pipeline's shape, which the Telegram bot and alert feed use. */
function toOpportunity(a: StreamArb): ArbitrageOpportunity {
  return {
    timestamp: new Date().toISOString(),
    kalshi_market_id: a.kalshi_ticker,
    poly_market_id: a.pair_id.slice(a.pair_id.lastIndexOf(":") + 1),
    poly_event: a.poly_event,
    kalshi_event: a.poly_event,
    poly_label: a.poly_label,
    kalshi_label: a.kalshi_label,
    event_score: 1,
    outcome_score: 1,
    kalshi_leg: a.kalshi_leg,
    poly_leg: a.poly_leg,
    kalshi_ask: a.kalshi_ask,
    poly_ask: a.poly_ask,
    gross_cost: a.kalshi_ask + a.poly_ask,
    gross_spread: 1 - a.kalshi_ask - a.poly_ask,
    net_profit_pct: a.net_profit_pct,
    poly_url: a.poly_url,
    kalshi_url: a.kalshi_url,
  };
}

// POST { arbs } — new arbs that have stayed open (ws-proxy/src/insights.ts), sent to users'
// Discord webhooks and the Telegram bot's subscribers.
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!fromStream(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { arbs?: StreamArb[] } | null;
  const arbs = Array.isArray(body?.arbs) ? body.arbs.slice(0, 10) : [];
  if (!arbs.length) return NextResponse.json({ ok: true, sent: 0 });

  const [subs, telegram] = await Promise.all([
    allSettings().then((all) => all.filter((s) => s.discord_webhook).slice(0, MAX_WEBHOOKS)),
    telegramBatch(arbs),
  ]);

  let discord = 0;
  await Promise.all(
    subs.map(async (s) => {
      const mine = arbs.filter((a) => a.net_profit_pct >= s.discord_min_pct);
      if (!mine.length) return;
      const r = await postDiscord(s.discord_webhook!, { embeds: mine.map(arbEmbed) });
      if (r === "ok") discord++;
      if (r === "gone") await saveSettings({ ...s, discord_webhook: null, updated: new Date().toISOString() });
    })
  );
  return NextResponse.json({ ok: true, discord, telegram });
}

/** Same rules as the old 10-minute scan: 2%+, each arb once a day, a few per batch. */
async function telegramBatch(arbs: StreamArb[]): Promise<number> {
  const candidates = arbs.filter((a) => a.net_profit_pct >= TELEGRAM_MIN_PROFIT_PCT).map(toOpportunity);
  const fresh: ArbitrageOpportunity[] = [];
  for (const o of candidates) {
    if (fresh.length >= TELEGRAM_MAX_ARBS) break;
    if (await markSeen(oppKey(o))) fresh.push(o);
  }
  if (!fresh.length) return 0;
  await recordAlerts(fresh);

  const chats = await getSubscriberIds();
  let sent = 0;
  for (const chat of chats) {
    for (const o of fresh) {
      if (sent >= MAX_TELEGRAM_MESSAGES) return sent;
      if (!(await sendMessage(chat, formatAlert(o)))) {
        await removeSubscriber(chat);
        break;
      }
      sent++;
    }
  }
  return sent;
}
