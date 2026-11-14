import { NextRequest, NextResponse } from "next/server";
import { fromStream } from "@/lib/streamAuth";
import { allRules, getSettings, updateRuleState, type WatchRule } from "@/lib/alerts";
import { getUser } from "@/lib/users";
import { arbEmbed, emailLayout, esc, pairUrl, postDiscord, sendEmails, type Email, type StreamArb } from "@/lib/notify";

export const dynamic = "force-dynamic";

type Trigger =
  | { key: string; kind: "base"; to: number }
  | { key: string; kind: "move"; from: number; to: number; kalshi: number | null; polymarket: number | null }
  | { key: string; kind: "gap"; arb: StreamArb };

const MAX_TRIGGERS = 12;
const pct = (p: number) => `${(p * 100).toFixed(1)}%`;

// POST { triggers } — watchlist rules the stream service found tripped. Sends each user's alert
// to their Discord webhook and email, then stores the new baseline / cooldown.
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!fromStream(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { triggers?: Trigger[] } | null;
  const triggers = Array.isArray(body?.triggers) ? body.triggers.slice(0, MAX_TRIGGERS) : [];
  if (!triggers.length) return NextResponse.json({ ok: true });

  const rules = new Map((await allRules()).map((r) => [`${r.user_id}#${r.pair_id}`, r]));
  const emails: Email[] = [];
  let sent = 0;

  for (const t of triggers) {
    const rule = rules.get(t.key);
    if (!rule) continue;
    if (t.kind === "base") {
      await updateRuleState(t.key, { base: t.to });
      continue;
    }
    const msg = describe(rule, t);
    const [settings, user] = await Promise.all([getSettings(rule.user_id), getUser(rule.user_id)]);
    if (settings?.discord_webhook) {
      const r = await postDiscord(settings.discord_webhook, t.kind === "gap"
        ? { content: `👀 Watchlist: ${msg.title}`, embeds: [arbEmbed(t.arb)] }
        : { content: `👀 **Watchlist:** ${msg.title}\n${msg.text}\n${pairUrl(rule.kalshi_market_id)}` });
      if (r === "ok") sent++;
    }
    if (user?.email) {
      emails.push({
        to: user.email,
        subject: msg.title,
        text: `${msg.text}\n\n${pairUrl(rule.kalshi_market_id)}\n\nManage your watchlist: https://www.omnipred.com/dashboard`,
        html: emailLayout(msg.title, `<p style="line-height:1.6">${esc(msg.text)}</p><p><a href="${pairUrl(rule.kalshi_market_id)}">Open the market on OmniPred →</a></p>`,
          `You're getting this because this market is on your OmniPred watchlist. <a href="https://www.omnipred.com/dashboard">Manage alerts</a>.`),
      });
    }
    await updateRuleState(t.key, t.kind === "move" ? { base: t.to } : { last_gap_ts: Date.now() });
  }
  if (emails.length && (await sendEmails(emails))) sent += emails.length;
  return NextResponse.json({ ok: true, sent });
}

function describe(rule: WatchRule, t: Exclude<Trigger, { kind: "base" }>): { title: string; text: string } {
  const name = `${rule.label} (${rule.event})`;
  if (t.kind === "move") {
    const dir = t.to > t.from ? "up" : "down";
    const venues = [t.kalshi !== null ? `Kalshi ${pct(t.kalshi)}` : null, t.polymarket !== null ? `Polymarket ${pct(t.polymarket)}` : null]
      .filter(Boolean).join(", ");
    return {
      title: `${rule.label} moved ${dir} to ${pct(t.to)}`,
      text: `${name} moved from ${pct(t.from)} to ${pct(t.to)}${venues ? ` (${venues})` : ""}.`,
    };
  }
  return {
    title: `+${t.arb.net_profit_pct.toFixed(2)}% gap opened on ${rule.label}`,
    text: `${name}: buy ${t.arb.kalshi_leg} on Kalshi at ${(t.arb.kalshi_ask * 100).toFixed(1)}¢ and ${t.arb.poly_leg} on Polymarket at ${(t.arb.poly_ask * 100).toFixed(1)}¢. About ${t.arb.net_after_fees_pct.toFixed(2)}% after estimated fees.`,
  };
}
