import { NextRequest, NextResponse } from "next/server";
import { fromStream } from "@/lib/streamAuth";
import { putIfAbsent } from "@/lib/db";
import { allSettings, unsubscribeToken } from "@/lib/alerts";
import { getMovers, type Mover } from "@/lib/insights";
import { arbEmbed, emailLayout, esc, pairUrl, postDiscord, sendEmails, type Email, type StreamArb } from "@/lib/notify";

export const dynamic = "force-dynamic";

const SITE = "https://www.omnipred.com";
const signed = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)}`;

// POST { date, top_arbs } — once a day: biggest movers and best open gaps, to Discord and email.
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!fromStream(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { date?: string; top_arbs?: StreamArb[] } | null;
  const date = body?.date ?? "";
  if (!/^\d{4}-\d\d-\d\d$/.test(date)) return NextResponse.json({ error: "Bad date" }, { status: 400 });
  if (!(await putIfAbsent({ pk: "daily", sk: date }))) return NextResponse.json({ ok: true, skipped: "already sent" });

  const arbs = (body?.top_arbs ?? []).slice(0, 5);
  const { movers } = await getMovers(5);
  const subs = await allSettings();

  // Discord: one summary message per webhook
  const moverLines = movers.map((m) => `**${signed(m.change)} pts** · ${m.label} — ${m.event} (${(m.to * 100).toFixed(0)}%)`).join("\n");
  const discordSubs = subs.filter((s) => s.discord_webhook).slice(0, 40);
  await Promise.all(
    discordSubs.map((s) =>
      postDiscord(s.discord_webhook!, {
        content: `📊 **OmniPred daily · ${date}**${moverLines ? `\n\n**Biggest movers (24h)**\n${moverLines}` : ""}${arbs.length ? "\n\n**Best open gaps after fees**" : ""}`,
        embeds: arbs.map(arbEmbed),
      })
    )
  );

  // Email digest
  const digestSubs = subs.filter((s) => s.digest && s.email);
  const html = digestHtml(arbs, movers);
  const text = digestText(arbs, movers);
  const emails: Email[] = digestSubs.map((s) => {
    const unsub = `${SITE}/api/digest/unsubscribe?u=${encodeURIComponent(s.user_id)}&t=${unsubscribeToken(s.user_id)}`;
    return {
      to: s.email,
      subject: `OmniPred daily: ${movers[0] ? `${movers[0].label} ${signed(movers[0].change)} pts` : "prediction market movers"}`,
      html: emailLayout(`Your daily prediction market brief · ${date}`, html,
        `You're getting this because you turned on the daily digest. <a href="${unsub}">Unsubscribe</a> · <a href="${SITE}/dashboard">Manage alerts</a>`),
      text: `${text}\n\nUnsubscribe: ${unsub}`,
      headers: { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    };
  });
  let emailed = 0;
  for (let i = 0; i < emails.length; i += 100) if (await sendEmails(emails.slice(i, i + 100))) emailed += emails.slice(i, i + 100).length;

  return NextResponse.json({ ok: true, discord: discordSubs.length, emailed, movers: movers.length, arbs: arbs.length });
}

function digestHtml(arbs: StreamArb[], movers: Mover[]): string {
  const row = (cells: string[]) => `<tr>${cells.map((c) => `<td style="padding:6px 8px;border-top:1px solid #eee;font-size:14px">${c}</td>`).join("")}</tr>`;
  const moversHtml = movers.length
    ? `<h2 style="font-size:16px;margin:16px 0 8px">Biggest movers in the last 24 hours</h2><table style="width:100%;border-collapse:collapse">${movers
        .map((m) => row([`<a href="${pairUrl(m.kalshi_market_id)}">${esc(m.label)}</a><br><span style="color:#666;font-size:12px">${esc(m.event)}</span>`, `${(m.from * 100).toFixed(0)}% → ${(m.to * 100).toFixed(0)}%`, `<b>${signed(m.change)} pts</b>`]))
        .join("")}</table>`
    : "";
  const arbsHtml = arbs.length
    ? `<h2 style="font-size:16px;margin:20px 0 8px">Best open gaps after estimated fees</h2><table style="width:100%;border-collapse:collapse">${arbs
        .map((a) => row([`<a href="${pairUrl(a.kalshi_ticker)}">${esc(a.poly_label)}</a><br><span style="color:#666;font-size:12px">${esc(a.poly_event)}</span>`, `Kalshi ${a.kalshi_leg} ${(a.kalshi_ask * 100).toFixed(1)}¢ + Poly ${a.poly_leg} ${(a.poly_ask * 100).toFixed(1)}¢`, `<b>≈+${a.net_after_fees_pct.toFixed(1)}%</b>`]))
        .join("")}</table><p style="font-size:12px;color:#666">Gaps move fast. Check both markets' rules and order books before trading. Not financial advice.</p>`
    : "";
  return `${moversHtml}${arbsHtml}<p style="margin-top:20px"><a href="${SITE}/arbitrage">Open the live scanner →</a></p>`;
}

function digestText(arbs: StreamArb[], movers: Mover[]): string {
  const m = movers.map((x) => `- ${x.label} (${x.event}): ${(x.from * 100).toFixed(0)}% -> ${(x.to * 100).toFixed(0)}% (${signed(x.change)} pts)`).join("\n");
  const a = arbs.map((x) => `- ${x.poly_label} (${x.poly_event}): about +${x.net_after_fees_pct.toFixed(1)}% after fees ${pairUrl(x.kalshi_ticker)}`).join("\n");
  return `${m ? `Biggest movers (24h)\n${m}\n\n` : ""}${a ? `Best open gaps\n${a}\n\n` : ""}Live scanner: ${SITE}/arbitrage`;
}
