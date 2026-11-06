"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Copy, KeyRound } from "lucide-react";

const STREAM_URL = process.env.NEXT_PUBLIC_STREAM_URL ?? "wss://pred-market.fly.dev/v1/stream";
const REST_URL = STREAM_URL.replace(/^ws/, "http").replace(/\/v1\/stream$/, "");

// Keep in sync with ws-proxy/src/limits.ts (free tier).
const FREE_FEATURES = [
  "Live best ask + size for YES and NO on Kalshi and Polymarket",
  "Up to 25 matched pairs per connection",
  "Arb stream: open / update / close events (top 20 in each snapshot)",
  "15 minutes of realtime updates per day, then a digest every 30s",
  "1 connection per key · 60 REST requests per hour",
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

function KeyBox({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="surface rounded-xl p-3 flex items-center gap-3 mt-3">
      <code className="flex-1 font-mono text-sm text-(--text-primary) break-all">{value}</code>
      <button
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
        }}
        className="px-3 py-2 rounded-lg bg-(--bg-subtle) text-sm text-(--text-primary) inline-flex items-center gap-1.5"
      >
        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export default function DevelopersClient() {
  const [email, setEmail] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [signingUp, setSigningUp] = useState(false);
  const [signupKey, setSignupKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manageKey, setManageKey] = useState("");
  const [manageMsg, setManageMsg] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);

  const signup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSigningUp(true);
    setError(null);
    try {
      const res = await fetch("/api/stream/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, accept_terms: accepted }),
      });
      const body = await res.json();
      if (!res.ok || !body.key) throw new Error(body.error ?? "signup failed");
      setSignupKey(body.key);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSigningUp(false);
    }
  };

  const rotate = async () => {
    setManageMsg(null);
    setNewKey(null);
    const res = await fetch("/api/stream/key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: manageKey }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setManageMsg(body.error ?? "something went wrong");
    setNewKey(body.key);
  };

  return (
    <div className="overflow-x-hidden">
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 sm:pt-20 pb-12">
        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-(--bg-subtle) mb-5">
          <span className="w-1.5 h-1.5 rounded-full bg-(--kalshi-teal) live-dot" />
          <span className="text-[10px] uppercase tracking-widest text-(--text-muted) font-medium">
            Free beta · WebSocket · order-book driven
          </span>
        </div>
        <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-(--text-primary) mb-4">OmniPred Data Stream</h1>
        <p className="text-(--text-secondary) text-base sm:text-xl leading-relaxed max-w-2xl">
          One socket for live Kalshi and Polymarket prices on the same questions, plus a cross-venue arbitrage feed
          computed from the actual order books. We maintain both venues&apos; books and push the top of book the moment it moves.
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
            {signupKey ? (
              <>
                <p className="text-sm text-(--text-secondary)">
                  Here is your key. <strong className="text-(--text-primary)">It is shown only once</strong>, so store it now.
                </p>
                <KeyBox value={signupKey} />
                <a href="#docs" className="inline-block text-sm text-(--kalshi-teal) hover:underline mt-4">
                  Connect to the stream →
                </a>
              </>
            ) : (
              <form onSubmit={signup} className="space-y-3">
                <p className="text-sm text-(--text-secondary)">One key per email. We only use it to contact you about the API.</p>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-3 py-2 rounded-lg bg-(--bg-subtle) border border-(--border) text-sm text-(--text-primary)"
                />
                <label className="flex gap-2 text-xs text-(--text-secondary) items-start">
                  <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-0.5" />
                  <span>
                    I agree to the <Link href="/terms" className="text-(--kalshi-teal) hover:underline">Terms of Service</Link> and{" "}
                    <Link href="/privacy" className="text-(--kalshi-teal) hover:underline">Privacy Policy</Link>.
                  </span>
                </label>
                <button
                  type="submit"
                  disabled={signingUp || !accepted || !email}
                  className="btn-lift w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-(--kalshi-teal) hover:opacity-90 text-white font-semibold text-sm disabled:opacity-60"
                >
                  {signingUp ? "Creating key…" : "Get my key"}
                  <ArrowRight className="w-4 h-4" />
                </button>
                {error && <p className="text-sm text-red-500">{error}</p>}
              </form>
            )}
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
          <h2 className="text-xl font-semibold text-(--text-primary) mb-2">Other operations and REST</h2>
          <Code>{`{"op":"usage"}  ->  realtime seconds left today, current limits
{"op":"unsubscribe","channel":"quotes"}          {"op":"ping"}  ->  {"type":"pong","ts":...}

GET ${REST_URL}/v1/pairs                      every matched pair with labels, scores, end dates
GET ${REST_URL}/v1/quotes?pair_id=...         current quotes (repeat pair_id, up to 25)
GET ${REST_URL}/v1/arbs?min_profit_pct=2      top open arbs, best first

REST responses carry X-RateLimit-Limit / -Remaining / -Reset headers.`}</Code>
        </div>
      </section>

      {/* Manage */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <div className="surface rounded-2xl p-6 max-w-4xl">
          <h2 className="text-lg font-semibold text-(--text-primary) mb-1 flex items-center gap-2">
            <KeyRound className="w-4 h-4" /> Rotate your key
          </h2>
          <p className="text-sm text-(--text-secondary) mb-4">
            If your key leaked, swap it for a new one. The old key stops working within a minute.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={manageKey}
              onChange={(e) => setManageKey(e.target.value)}
              placeholder="opk_..."
              className="flex-1 px-3 py-2 rounded-lg bg-(--bg-subtle) border border-(--border) text-sm font-mono text-(--text-primary)"
            />
            <button onClick={rotate} disabled={!manageKey} className="px-4 py-2 rounded-lg surface text-sm text-(--text-primary) hover:bg-(--surface-hover) disabled:opacity-50">
              Rotate key
            </button>
          </div>
          {manageMsg && <p className="text-sm text-red-500 mt-3">{manageMsg}</p>}
          {newKey && <KeyBox value={newKey} />}
        </div>
      </section>
    </div>
  );
}
