"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, KeyRound } from "lucide-react";

import { STREAM_URL, REST_URL } from "@/lib/streamLimits";

// Keep in sync with ws-proxy/src/limits.ts (free tier).
const FREE_FEATURES = [
  "Live best ask + size for YES and NO on Kalshi and Polymarket",
  "Median under 100 ms from the exchange to your socket (US East Coast)",
  "Up to 25 matched pairs per connection",
  "Arb stream: open / update / close events (top 20 in each snapshot)",
  "15 minutes of realtime updates per day, then a digest every 30s",
  "1 connection per account · 60 REST requests per hour",
  "API dashboard with your keys and usage",
];

const CONNECT_SNIPPET = `const ws = new WebSocket("${STREAM_URL}?api_key=YOUR_KEY");

ws.onopen = () => {
  // up to 25 pair_ids from GET /v1/pairs
  ws.send(JSON.stringify({ op: "subscribe", channel: "quotes", pairs: ["KXFEDDECISION-26DEC-H0:567890"] }));
  // arbs of 2%+ on well-matched pairs
  ws.send(JSON.stringify({
    op: "subscribe", channel: "arbs",
    min_profit_pct: 2, min_outcome_score: 0.9, min_event_score: 0.85,
  }));
};

ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.type === "quote") console.log(msg.pair_id, msg.kalshi.yes_ask, msg.polymarket.no_ask);
  if (msg.type === "arb") console.log(msg.event, msg.kalshi_label, msg.net_profit_pct + "%");
  if (msg.type === "notice") console.log(msg.message); // e.g. switched to 30s digests
};`;

const QUOTE_SAMPLE = `{
  "type": "quote",
  "pair_id": "KXPRESPERSON-28-JVAN:253591",
  "kalshi":     { "yes_ask": 0.29, "no_ask": 0.72, "yes_ask_size": 1520, "no_ask_size": 830,
                  "exchange_ts": 1793945405640, "recv_ts": 1793945405652 },
  "polymarket": { "yes_ask": 0.284, "no_ask": 0.719, "yes_ask_size": 4210.5, "no_ask_size": 917,
                  "exchange_ts": 1793945405601, "recv_ts": 1793945405609 },
  "ts": 1793945405652
}`;

const ARB_SAMPLE = `{
  "type": "arb", "event": "open",
  "arb_id": "KXPRESPERSON-28-JVAN:253591:NO",
  "kalshi_leg": "NO", "poly_leg": "YES",
  "kalshi_ask": 0.69, "poly_ask": 0.284,
  "gross_cost": 0.974, "net_profit_pct": 2.669,
  "max_contracts": 830, "max_profit_usd": 21.58,
  "kalshi_label": "JD Vance", "poly_label": "JD Vance",
  "event_score": 0.94, "outcome_score": 1,
  "kalshi_end_date": "2028-11-07", "poly_end_date": "2028-11-07",
  "kalshi_url": "https://kalshi.com/events/...", "poly_url": "https://polymarket.com/event/...",
  "opened_ts": 1793945405652, "updated_ts": 1793945405652
}`;

function Code({ children }: { children: string }) {
  return (
    <pre className="surface rounded-xl p-4 text-xs leading-relaxed font-mono text-(--text-secondary) overflow-x-auto whitespace-pre">
      {children}
    </pre>
  );
}

export default function DevelopersClient() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((b) => setSignedIn(!!b.user))
      .catch(() => setSignedIn(false));
  }, []);

  return (
    <div className="overflow-x-hidden">
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 sm:pt-20 pb-12">
        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-(--bg-subtle) mb-5">
          <span className="w-1.5 h-1.5 rounded-full bg-(--kalshi-teal) live-dot" />
          <span className="text-[10px] uppercase tracking-widest text-(--text-muted) font-medium">
            Free beta · WebSocket · &lt;100 ms median
          </span>
        </div>
        <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-(--text-primary) mb-4">OmniPred Data Stream</h1>
        <p className="text-(--text-secondary) text-base sm:text-xl leading-relaxed max-w-2xl">
          One socket for live Kalshi and Polymarket prices on the same questions, plus a cross-venue arbitrage feed
          computed from the actual order books. We maintain both venues&apos; books and push the top of book the moment it
          moves, typically under 100 ms after the exchange records the change.
        </p>
      </section>

      {/* Free beta signup */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <div className="grid md:grid-cols-2 gap-4 max-w-4xl">
          <div className="surface rounded-2xl p-6">
            <h2 className="text-lg font-semibold text-(--text-primary) mb-1">Free beta</h2>
            <p className="mb-4">
              <span className="text-4xl font-bold text-(--text-primary)">$0</span>
              <span className="text-(--text-muted) text-sm"> while in beta</span>
            </p>
            <ul className="space-y-2">
              {FREE_FEATURES.map((f) => (
                <li key={f} className="flex gap-2 text-sm text-(--text-secondary)">
                  <Check className="w-4 h-4 mt-0.5 shrink-0 text-(--kalshi-teal)" />
                  {f}
                </li>
              ))}
            </ul>
          </div>

          <div className="surface rounded-2xl p-6">
            <h2 className="text-lg font-semibold text-(--text-primary) mb-1 flex items-center gap-2">
              <KeyRound className="w-4 h-4" /> Get a free API key
            </h2>
            <p className="text-sm text-(--text-secondary) mb-5">
              Sign in with Google or GitHub to create keys and track your usage in the API dashboard. No password, no card.
            </p>
            <Link
              href={signedIn ? "/dashboard" : "/login?next=/dashboard"}
              className="btn-lift w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-(--kalshi-teal) hover:opacity-90 text-white font-semibold text-sm"
            >
              {signedIn ? "Open your dashboard" : "Sign in to get a key"}
              <ArrowRight className="w-4 h-4" />
            </Link>
            <p className="text-xs text-(--text-muted) mt-4">
              By signing in you agree to the <Link href="/terms" className="underline">Terms</Link> and{" "}
              <Link href="/privacy" className="underline">Privacy Policy</Link>.
            </p>
          </div>
        </div>
        <p className="text-xs text-(--text-muted) mt-4 max-w-3xl">
          Pairs are matched by our pipeline; check <code>event_score</code>, <code>outcome_score</code> and both end dates
          before trading, since venues sometimes word the same market differently. Profit figures are before venue fees.
          Data is provided as-is and is not financial advice.
        </p>
      </section>

      {/* Docs */}
      <section id="docs" className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-16 space-y-8 max-w-4xl">
        <div>
          <h2 className="text-xl font-semibold text-(--text-primary) mb-2">Connect</h2>
          <p className="text-sm text-(--text-secondary) mb-3">
            Authenticate with <code>?api_key=</code>, an <code>X-API-Key</code> header or <code>Authorization: Bearer</code>.
            Each subscribe returns a <code>snapshot</code> of current state, then live updates follow. After your daily
            realtime minutes are used you get a <code>notice</code> and updates arrive as 30-second digests until 00:00 UTC.
          </p>
          <Code>{CONNECT_SNIPPET}</Code>
        </div>
        <div>
          <h2 className="text-xl font-semibold text-(--text-primary) mb-2">Quote messages</h2>
          <p className="text-sm text-(--text-secondary) mb-3">
            Sent whenever either venue&apos;s best ask or size changes for a pair. Prices are in dollars (0–1); sizes are contracts.
          </p>
          <Code>{QUOTE_SAMPLE}</Code>
        </div>
        <div>
          <h2 className="text-xl font-semibold text-(--text-primary) mb-2">Arb messages</h2>
          <p className="text-sm text-(--text-secondary) mb-3">
            <code>open</code> when buying one side on each venue costs under $1, <code>update</code> when price or size moves,{" "}
            <code>close</code> when the gap is gone. One of the two legs pays $1 at settlement.
          </p>
          <Code>{ARB_SAMPLE}</Code>
        </div>
        <div>
          <h2 className="text-xl font-semibold text-(--text-primary) mb-2">Latency</h2>
          <p className="text-sm text-(--text-secondary) mb-3">
            Nothing is batched while you&apos;re in realtime mode: each order-book change is pushed as soon as we process it.
            In our measurements from the US East Coast, the time from the exchange&apos;s own timestamp to the message
            arriving at the client had a median of about 55 ms for Polymarket and 80 ms for Kalshi, with 90% of updates
            under 130 ms. Our servers are in Newark, NJ, so expect more from farther away.
          </p>
          <p className="text-sm text-(--text-secondary) mb-3">
            Every quote carries <code>exchange_ts</code> (when the venue says the change happened) and <code>recv_ts</code>{" "}
            (when our server received it), both in Unix milliseconds, so you can measure it yourself. Use{" "}
            <code>ping</code> to correct for your clock:
          </p>
          <Code>{`// offset = server clock - your clock, from a ping round trip
const sent = Date.now();
ws.send(JSON.stringify({ op: "ping" }));
// on {"type":"pong","ts":...}:  offset = pong.ts - (sent + (Date.now() - sent) / 2)

// on each quote:
const latencyMs = Date.now() + offset - msg.kalshi.exchange_ts;`}</Code>
          <p className="text-xs text-(--text-muted) mt-3">
            Figures depend on the venues&apos; clocks and network conditions and are not guaranteed. Free accounts get
            realtime delivery for 15 minutes a day, then 30-second digests.
          </p>
        </div>
        <div>
          <h2 className="text-xl font-semibold text-(--text-primary) mb-2">Other operations and REST</h2>
          <Code>{`{"op":"usage"}  ->  realtime seconds left today, current limits
{"op":"unsubscribe","channel":"quotes"}          {"op":"ping"}  ->  {"type":"pong","ts":...}

GET ${REST_URL}/v1/pairs                      every matched pair with labels, scores, end dates
GET ${REST_URL}/v1/quotes?pair_id=...         current quotes (repeat pair_id, up to 25)
GET ${REST_URL}/v1/arbs?min_profit_pct=2      top open arbs, best first

REST responses carry X-RateLimit-Limit / -Remaining / -Reset headers.`}</Code>
        </div>
      </section>

    </div>
  );
}
