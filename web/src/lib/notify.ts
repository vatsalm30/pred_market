// Discord webhook and email delivery for alerts and the daily digest.
// Email goes through Resend (RESEND_API_KEY, RESEND_FROM); without a key, email is skipped.

const SITE = "https://www.omnipred.com";

/** An arb as the stream service describes it (ws-proxy/src/insights.ts describe()). */
export interface StreamArb {
  arb_id: string;
  pair_id: string;
  kalshi_leg: "YES" | "NO";
  poly_leg: "YES" | "NO";
  kalshi_ask: number;
  poly_ask: number;
  net_profit_pct: number;
  net_after_fees_pct: number;
  max_contracts: number | null;
  max_profit_usd: number | null;
  poly_event: string;
  poly_label: string;
  kalshi_label: string;
  poly_url: string;
  kalshi_url: string;
  kalshi_ticker: string;
  poly_end_date: string | null;
  kalshi_end_date: string | null;
}

const cents = (p: number) => `${(p * 100).toFixed(1)}¢`;
export const pairUrl = (kalshiTicker: string) => `${SITE}/arb/${encodeURIComponent(kalshiTicker)}`;

export function arbEmbed(a: StreamArb) {
  return {
    title: `+${a.net_profit_pct.toFixed(2)}% · ${a.poly_label}`.slice(0, 256),
    url: pairUrl(a.kalshi_ticker),
    description: a.poly_event.slice(0, 300),
    color: 0x00b3a1,
    fields: [
      { name: "Kalshi", value: `[${a.kalshi_leg} @ ${cents(a.kalshi_ask)}](${a.kalshi_url})`, inline: true },
      { name: "Polymarket", value: `[${a.poly_leg} @ ${cents(a.poly_ask)}](${a.poly_url})`, inline: true },
      { name: "After est. fees", value: `${a.net_after_fees_pct > 0 ? "+" : ""}${a.net_after_fees_pct.toFixed(2)}%`, inline: true },
      ...(a.max_contracts !== null ? [{ name: "Size at these prices", value: `${Math.floor(a.max_contracts)} contracts`, inline: true }] : []),
      ...(a.kalshi_end_date ? [{ name: "Closes", value: a.kalshi_end_date, inline: true }] : []),
    ],
    footer: { text: "OmniPred · check both rulebooks before trading · not financial advice" },
  };
}

/** Returns false if the webhook is gone (deleted in Discord), so callers can drop it. */
export async function postDiscord(webhook: string, body: { content?: string; embeds?: object[] }): Promise<"ok" | "gone" | "error"> {
  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "OmniPred", allowed_mentions: { parse: [] }, ...body }),
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 404 || res.status === 401) return "gone";
    return res.ok ? "ok" : "error";
  } catch {
    return "error";
  }
}

export const emailEnabled = () => !!process.env.RESEND_API_KEY;

export interface Email {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
}

/** Sends up to 100 emails in one request. */
export async function sendEmails(emails: Email[]): Promise<boolean> {
  if (!emailEnabled() || emails.length === 0) return false;
  const from = process.env.RESEND_FROM ?? "OmniPred <digest@omnipred.com>";
  const res = await fetch("https://api.resend.com/emails/batch", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(emails.slice(0, 100).map((e) => ({ from, ...e }))),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) console.error("resend:", res.status, await res.text().catch(() => ""));
  return res.ok;
}

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Minimal, mostly-plain email layout that renders the same everywhere. */
export function emailLayout(title: string, bodyHtml: string, footerHtml: string): string {
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f7f8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:24px">
<p style="margin:0 0 4px;font-size:12px;color:#666">OmniPred</p>
<h1 style="margin:0 0 16px;font-size:20px">${esc(title)}</h1>
${bodyHtml}
<p style="margin:24px 0 0;font-size:12px;color:#888;line-height:1.5">${footerHtml}</p>
</div></body></html>`;
}
