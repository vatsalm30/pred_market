import Link from "next/link";
import fs from "fs";
import path from "path";
import { ArrowRight, Zap, TrendingUp, Bell } from "lucide-react";
import { PolymarketLogo, KalshiLogo, TelegramLogo, TelegramPlaneIcon } from "@/components/PlatformLogos";
import { formatVolume } from "@/lib/csv";

export const revalidate = 3600;

const TELEGRAM_BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "omnipred_bot";
const TELEGRAM_URL = `https://t.me/${TELEGRAM_BOT_USERNAME}`;

const TICKER_ITEMS = [
  { label: "2026 FIFA World Cup Winner", platform: "poly" as const },
  { label: "NBA Champion",               platform: "kalshi" as const },
  { label: "Brazil Presidential Election", platform: "poly" as const },
  { label: "2026 French Open",           platform: "kalshi" as const },
  { label: "Republican Primary 2028",    platform: "poly" as const },
  { label: "California Governor",        platform: "kalshi" as const },
  { label: "PGA Championship",           platform: "poly" as const },
  { label: "Fed Rate Decision",          platform: "kalshi" as const },
  { label: "Congress Balance of Power",  platform: "poly" as const },
  { label: "Israel Prime Minister",      platform: "kalshi" as const },
  { label: "Bitcoin price end of year",  platform: "poly" as const },
  { label: "Stanley Cup Champion",       platform: "kalshi" as const },
];

function Ticker() {
  const doubled = [...TICKER_ITEMS, ...TICKER_ITEMS];
  return (
    <div className="overflow-hidden border-y border-[--border-subtle] py-3 select-none">
      <div className="flex gap-8 marquee-track w-max">
        {doubled.map((item, i) => (
          <div key={i} className="flex items-center gap-2 whitespace-nowrap">
            {item.platform === "poly" ? <PolymarketLogo size={14} /> : <KalshiLogo size={14} />}
            <span className="text-xs text-[--text-secondary]">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function getHomeStats() {
  try {
    const base    = path.join(process.cwd(), "public", "data");
    const events  = JSON.parse(fs.readFileSync(path.join(base, "all_events.json"), "utf8"))              as Array<{ volume?: number }>;
    const matched = JSON.parse(fs.readFileSync(path.join(base, "matched_markets.json"), "utf8"))         as Array<{ poly_event: string }>;
    const arb     = JSON.parse(fs.readFileSync(path.join(base, "arbitrage_opportunities.json"), "utf8")) as unknown[];
    return {
      totalMarkets:  events.length,
      matchedEvents: new Set(matched.map((r) => r.poly_event)).size,
      outcomePairs:  matched.length,
      arbOpps:       arb.length,
      totalVolume:   events.reduce((s, e) => s + (e.volume ?? 0), 0),
    };
  } catch {
    return { totalMarkets: 0, matchedEvents: 0, outcomePairs: 0, arbOpps: 0, totalVolume: 0 };
  }
}

export default function HomePage() {
  const stats = getHomeStats();

  return (
    <div className="overflow-x-hidden">
      {/* ── Hero ─────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 sm:pt-20 pb-12 sm:pb-16">
        <div className="animate-in flex items-center gap-3 mb-8 sm:mb-10">
          <div className="float-a"><PolymarketLogo size={36} /></div>
          <span className="text-[--text-muted] text-sm">vs</span>
          <div className="float-b"><KalshiLogo size={36} /></div>
        </div>

        <div className="max-w-3xl">
          <h1
            className="animate-in text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.06] text-[--text-primary] mb-5 sm:mb-6"
            style={{ animationDelay: "0.05s" }}
          >
            Compare odds across prediction markets
          </h1>

          <p
            className="animate-in text-[--text-secondary] text-base sm:text-xl leading-relaxed max-w-xl mb-8 sm:mb-10"
            style={{ animationDelay: "0.15s" }}
          >
            Polymarket and Kalshi are pricing the same events differently. We match them up and show you where the gaps are.
          </p>

          <div
            className="animate-in flex flex-col sm:flex-row gap-3"
            style={{ animationDelay: "0.25s" }}
          >
            <Link
              href="/events?view=compare"
              className="btn-lift inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[--text-primary] text-[--bg] font-semibold text-sm"
            >
              See matched markets
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/arbitrage"
              className="btn-lift inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl surface text-[--text-secondary] font-medium text-sm hover:text-[--text-primary] transition-colors"
            >
              <Zap className="w-4 h-4 text-[--arb-amber]" />
              Arbitrage scanner
            </Link>
          </div>
        </div>
      </section>

      {/* ── Ticker ───────────────────────────────────────── */}
      <Ticker />

      {/* ── Live stat strip ──────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          {([
            {
              label: "Markets tracked",
              value: stats.totalMarkets,
              sub: stats.totalVolume > 0 ? `${formatVolume(stats.totalVolume)} total vol` : undefined,
            },
            { label: "Matched events",    value: stats.matchedEvents },
            { label: "Outcome pairs",     value: stats.outcomePairs },
            { label: "Arb opportunities", value: stats.arbOpps, live: true },
          ] as const).map((s, i) => (
            <div
              key={i}
              className="animate-in surface rounded-2xl px-4 sm:px-5 py-4 sm:py-5"
              style={{ animationDelay: `${(i + 1) * 0.08}s` }}
            >
              <p className="text-[10px] uppercase tracking-widest text-[--text-muted] font-medium mb-1.5">{s.label}</p>
              <p className="text-2xl sm:text-3xl font-bold text-[--text-primary] tabular-nums">
                {s.value > 0 ? s.value.toLocaleString() : "—"}
              </p>
              {"sub" in s && s.sub && <p className="text-[11px] text-[--text-muted] mt-0.5">{s.sub}</p>}
              {"live" in s && s.live && (
                <p className="text-[11px] text-[--kalshi-teal] mt-0.5 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[--kalshi-teal] live-dot" /> Live
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── Stats prose ──────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-16 sm:pb-20">
        <p className="animate-in text-[--text-secondary] text-base sm:text-lg leading-loose max-w-2xl">
          Right now we track{" "}
          <strong className="text-[--text-primary] font-semibold tabular-nums">
            {(stats.matchedEvents || 1309).toLocaleString()}
          </strong>{" "}
          matched events across both platforms, covering{" "}
          <strong className="text-[--text-primary] font-semibold tabular-nums">
            {(stats.outcomePairs || 5742).toLocaleString()}
          </strong>{" "}
          individual outcome pairs. Wherever prices diverge, we surface it. There are currently{" "}
          <strong className="text-[--text-primary] font-semibold tabular-nums">
            {(stats.arbOpps || 2461).toLocaleString()}
          </strong>{" "}
          arbitrage opportunities in the live snapshot — and our{" "}
          <Link href="/alerts" className="text-[#229ED9] hover:underline font-medium">
            Telegram bot
          </Link>{" "}
          pings you the moment new ones appear.
        </p>
      </section>

      {/* ── Preview table ─────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <div className="animate-in flex items-center justify-between mb-5">
          <h2 className="text-xl font-semibold text-[--text-primary]">A sample of what we track</h2>
          <Link
            href="/events"
            className="link-arrow text-sm text-[--text-secondary] hover:text-[--text-primary] transition-colors flex items-center gap-1"
          >
            All markets <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="animate-in surface rounded-2xl overflow-hidden" style={{ animationDelay: "0.08s" }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[--border-subtle]">
                  <th className="text-left px-5 py-3.5 text-[--text-muted] font-medium text-xs uppercase tracking-wider">Event</th>
                  <th className="text-left px-4 py-3.5 text-[--text-muted] font-medium text-xs uppercase tracking-wider hidden sm:table-cell">Outcome</th>
                  <th className="text-center px-4 py-3.5 font-medium text-xs">
                    <span className="flex items-center justify-center gap-1.5 text-[--text-muted]">
                      <PolymarketLogo size={14} /> Poly
                    </span>
                  </th>
                  <th className="text-center px-4 py-3.5 font-medium text-xs">
                    <span className="flex items-center justify-center gap-1.5 text-[--text-muted]">
                      <KalshiLogo size={14} /> Kalshi
                    </span>
                  </th>
                  <th className="text-right px-5 py-3.5 text-[--text-muted] font-medium text-xs uppercase tracking-wider">Gap</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { event: "2026 FIFA World Cup",  outcome: "Spain",                   poly: "16.2%", kalshi: "14.1%", gap: "+2.1pp" },
                  { event: "2028 GOP Primary",     outcome: "Donald Trump",            poly: "41.0%", kalshi: "38.0%", gap: "+3.0pp" },
                  { event: "NBA MVP",              outcome: "Shai Gilgeous-Alexander", poly: "31.0%", kalshi: "28.0%", gap: "+3.0pp" },
                  { event: "Brazil Presidential",  outcome: "Lula da Silva",           poly: "44.0%", kalshi: "41.0%", gap: "+3.0pp" },
                  { event: "Fed Rate Decision",    outcome: "Cut by 25bps",            poly: "38.0%", kalshi: "35.0%", gap: "+3.0pp" },
                ].map((m, i) => (
                  <tr
                    key={i}
                    className="border-b border-[--border-subtle] last:border-0 hover:bg-[--surface-hover] transition-colors"
                  >
                    <td className="px-5 py-4">
                      <span className="text-[--text-primary] font-medium">{m.event}</span>
                      <span className="sm:hidden text-[--text-muted] text-xs"> · {m.outcome}</span>
                    </td>
                    <td className="px-4 py-4 text-[--text-secondary] hidden sm:table-cell">{m.outcome}</td>
                    <td className="px-4 py-4 text-center font-mono font-medium text-[#1652F0] dark:text-[#5b8df8]">{m.poly}</td>
                    <td className="px-4 py-4 text-center font-mono font-medium text-[--kalshi-teal]">{m.kalshi}</td>
                    <td className="px-5 py-4 text-right font-mono font-semibold text-[--arb-amber]">{m.gap}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────── */}
      <section className="border-t border-[--border-subtle] py-16 sm:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="animate-in text-2xl font-semibold text-[--text-primary] mb-10 sm:mb-12">How it works</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-12 gap-y-8 sm:gap-y-10">
            {[
              {
                n: "01",
                title: "Markets are matched",
                body: 'An AI matcher finds equivalent markets on both platforms. "2026 FIFA World Cup Winner" on Polymarket corresponds to "2026 Men\'s World Cup Winner" on Kalshi.',
              },
              {
                n: "02",
                title: "Prices are compared",
                body: "For every outcome we pull the current ask price from each platform. Spain at 16.2% on Polymarket vs. 14.1% on Kalshi is a 2.1 percentage point gap.",
              },
              {
                n: "03",
                title: "Gaps surface automatically",
                body: "When the combined cost of YES on one side and NO on the other is less than $1, you have a risk-free arbitrage. The scanner flags these as they appear.",
              },
            ].map((step, i) => (
              <div key={i} className="animate-in" style={{ animationDelay: `${i * 0.1}s` }}>
                <span className="text-5xl font-bold text-[--border] tabular-nums select-none">{step.n}</span>
                <h3 className="text-[--text-primary] font-semibold mt-3 mb-2">{step.title}</h3>
                <p className="text-[--text-secondary] text-sm leading-relaxed">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Telegram alerts ──────────────────────────────── */}
      <section className="border-t border-[--border-subtle] py-16 sm:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="animate-in surface rounded-2xl overflow-hidden">
            <div className="relative px-6 sm:px-10 py-10 sm:py-12 flex flex-col lg:flex-row items-start lg:items-center gap-8 lg:gap-12">
              <div
                aria-hidden="true"
                className="absolute -top-24 -right-20 w-72 h-72 rounded-full blur-3xl opacity-20 pointer-events-none"
                style={{ background: "radial-gradient(circle, #229ED9 0%, transparent 70%)" }}
              />

              <div className="relative flex-1">
                <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-[--bg-subtle] mb-4">
                  <span className="w-1.5 h-1.5 rounded-full bg-[--kalshi-teal] live-dot" />
                  <span className="text-[10px] uppercase tracking-widest text-[--text-muted] font-medium">Free alerts</span>
                </div>

                <div className="flex items-center gap-3 mb-3">
                  <TelegramLogo size={32} />
                  <h2 className="text-2xl sm:text-3xl font-semibold text-[--text-primary]">
                    Get arbitrage alerts on Telegram
                  </h2>
                </div>

                <p className="text-[--text-secondary] text-sm sm:text-base leading-relaxed max-w-xl">
                  The scanner watches Polymarket and Kalshi prices live. When a new ≥2% spread appears, our bot pings you instantly — no app to install, no email to check. Just{" "}
                  <code className="text-[--text-primary] font-mono">/start</code> in Telegram.
                </p>

                <ul className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 text-xs sm:text-sm text-[--text-secondary]">
                  {["Fires every 10 minutes", "Top 5 opps per alert", "Free, /stop any time"].map((item, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <Bell className="w-3.5 h-3.5 text-[--arb-amber] shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="relative flex flex-col gap-3 w-full lg:w-auto shrink-0">
                <a
                  href={TELEGRAM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-lift inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#229ED9] hover:bg-[#1a8ec5] text-white font-semibold text-sm transition-colors"
                >
                  <TelegramPlaneIcon size={20} className="text-white" />
                  Open in Telegram
                  <ArrowRight className="w-4 h-4" />
                </a>
                <Link
                  href="/alerts"
                  className="text-xs text-[--text-secondary] hover:text-[--text-primary] text-center transition-colors"
                >
                  See the live alert feed →
                </Link>
                <p className="text-[11px] text-[--text-muted] text-center font-mono">@{TELEGRAM_BOT_USERNAME}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
        <div className="animate-in surface rounded-2xl px-6 sm:px-8 py-8 sm:py-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <PolymarketLogo size={20} />
              <span className="text-[--text-muted] text-sm">vs</span>
              <KalshiLogo size={20} />
            </div>
            <h3 className="text-[--text-primary] text-xl font-semibold">Ready to start comparing?</h3>
            <p className="text-[--text-secondary] text-sm mt-1">
              {stats.totalMarkets > 0
                ? `${stats.totalMarkets.toLocaleString()} markets, ${stats.arbOpps.toLocaleString()} arb opportunities right now.`
                : "See which platform has better odds for the markets you care about."}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 shrink-0 w-full sm:w-auto">
            <Link
              href="/events?view=compare"
              className="btn-lift inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[--text-primary] text-[--bg] font-semibold text-sm"
            >
              <TrendingUp className="w-4 h-4" />
              Compare Markets
            </Link>
            <Link
              href="/arbitrage"
              className="btn-lift inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-[--border] text-[--text-secondary] font-medium text-sm hover:text-[--text-primary] hover:bg-[--surface-hover] transition-colors"
            >
              <Zap className="w-4 h-4 text-[--arb-amber]" />
              Scan for Arb
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
