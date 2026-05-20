"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { ExternalLink, ArrowLeft, Calendar, TrendingUp, Users, Zap, ArrowUpRight } from "lucide-react";
import {
  fetchAllEvents, fetchMatchedMarkets, fetchArbitrageOpportunities,
  type AllEvent, type GroupedMarket, type ArbitrageOpportunity,
  formatVolume,
} from "@/lib/csv";
import { PolymarketLogo, KalshiLogo } from "@/components/PlatformLogos";
import EventIcon from "@/components/EventIcon";

function fmtDate(d?: string | null): string {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00Z");
  if (isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function pct(v: number | null | undefined): string {
  if (v == null) return "—";
  return (v * 100).toFixed(1) + "%";
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="surface rounded-xl px-4 py-3">
      <p className="text-[--text-muted] text-[10px] uppercase tracking-widest font-medium mb-1">{label}</p>
      <p className="text-[--text-primary] text-lg font-bold tabular-nums">{value}</p>
      {sub && <p className="text-[--text-muted] text-[11px] mt-0.5">{sub}</p>}
    </div>
  );
}

function OddsSection({ event, matched }: { event: AllEvent; matched: GroupedMarket | null }) {
  if (!matched) {
    const polyPrice   = event.yes_price_poly;
    const kalshiPrice = event.yes_price_kalshi;
    if (polyPrice == null && kalshiPrice == null) return null;

    const rows = [
      { label: "Polymarket", price: polyPrice,   color: "#1652F0", show: event.platforms.includes("polymarket") },
      { label: "Kalshi",     price: kalshiPrice, color: "#00B3A1", show: event.platforms.includes("kalshi") },
    ].filter((r) => r.show && r.price != null);

    return (
      <div className="surface rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[--border-subtle]">
          <h2 className="text-sm font-semibold text-[--text-primary]">Probability</h2>
        </div>
        <div className="px-5 py-4 space-y-4">
          {rows.map((row) => {
            const yesPct = (row.price! * 100);
            return (
              <div key={row.label}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm text-[--text-secondary]">{row.label}</span>
                  <span className="font-mono text-sm font-semibold" style={{ color: row.color }}>
                    {pct(row.price)} YES
                  </span>
                </div>
                <div className="relative h-5 rounded-full bg-[--bg-subtle]">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full flex items-center justify-end pr-2"
                    style={{ width: `${yesPct}%`, minWidth: "10px", background: row.color + "CC" }}
                  >
                    {yesPct > 12 && <span className="text-white/90 text-[10px] font-medium">{pct(row.price)}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const isBinary = matched.outcomes.length <= 2;

  if (isBinary) {
    const o = matched.outcomes[0];
    const rows = [
      { label: "Polymarket", yes: o.poly_yes_ask   as number | undefined, color: "#1652F0", logo: <PolymarketLogo size={13} /> },
      { label: "Kalshi",     yes: o.kalshi_yes_ask as number | undefined, color: "#00B3A1", logo: <KalshiLogo size={13} /> },
    ];
    return (
      <div className="surface rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[--border-subtle]">
          <h2 className="text-sm font-semibold text-[--text-primary]">Probability Comparison</h2>
        </div>
        <div className="px-5 py-4 space-y-4">
          {rows.map((row) => {
            if (row.yes == null) return null;
            const yesPct = row.yes * 100;
            return (
              <div key={row.label}>
                <div className="flex items-center gap-2 mb-1.5">
                  {row.logo}
                  <span className="text-sm text-[--text-secondary]">{row.label}</span>
                  <span className="ml-auto font-mono text-sm font-semibold" style={{ color: row.color }}>
                    {pct(row.yes)} YES
                  </span>
                </div>
                <div className="relative h-5 rounded-full bg-[--bg-subtle]">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full flex items-center justify-end pr-2"
                    style={{ width: `${yesPct}%`, minWidth: "10px", background: row.color + "CC" }}
                  >
                    {yesPct > 12 && <span className="text-white/90 text-[10px] font-medium">{pct(row.yes)}</span>}
                  </div>
                  {(100 - yesPct) > 14 && (
                    <span className="absolute inset-y-0 right-0 flex items-center pr-2 text-[10px] text-[--text-muted]">
                      {pct(1 - row.yes)} NO
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const priced = matched.outcomes
    .filter((o) => o.poly_yes_ask != null || o.kalshi_yes_ask != null)
    .sort((a, b) =>
      ((b.poly_yes_ask ?? b.kalshi_yes_ask ?? 0) as number) - ((a.poly_yes_ask ?? a.kalshi_yes_ask ?? 0) as number)
    )
    .slice(0, 10);

  return (
    <div className="surface rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-[--border-subtle] flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[--text-primary]">Outcome Comparison</h2>
        <div className="flex items-center gap-3 text-[10px] text-[--text-muted]">
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-[#1652F0]/80" /> Polymarket</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-[#00B3A1]/80" /> Kalshi</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[--border-subtle]">
              <th className="text-left px-5 py-2.5 text-[--text-muted] font-medium text-xs">Outcome</th>
              <th className="text-right px-4 py-2.5 text-xs">
                <span className="flex items-center justify-end gap-1 text-[--text-muted]"><PolymarketLogo size={11} /> YES</span>
              </th>
              <th className="text-right px-4 py-2.5 text-xs">
                <span className="flex items-center justify-end gap-1 text-[--text-muted]"><KalshiLogo size={11} /> YES</span>
              </th>
              <th className="text-right px-5 py-2.5 text-xs text-[--text-muted] hidden sm:table-cell">Spread</th>
            </tr>
          </thead>
          <tbody>
            {priced.map((o, i) => {
              const polyYes   = o.poly_yes_ask   as number | undefined;
              const kalshiYes = o.kalshi_yes_ask as number | undefined;
              const spread    = polyYes != null && kalshiYes != null ? Math.abs(polyYes - kalshiYes) * 100 : null;
              const spreadColor =
                spread == null  ? "text-[--text-muted]"
                : spread >= 3   ? "text-[--arb-amber] font-semibold"
                : spread >= 1   ? "text-emerald-500 dark:text-emerald-400"
                : "text-[--text-muted]";
              return (
                <tr key={i} className="border-b border-[--border-subtle] last:border-0 hover:bg-[--surface-hover] transition-colors">
                  <td className="px-5 py-2.5 text-[--text-secondary] text-sm">{o.poly_label}</td>
                  <td className="px-4 py-2.5 text-right">
                    <span className="text-[#1652F0] dark:text-[#5b8df8] font-mono text-xs font-medium">{pct(polyYes)}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span className="text-[--kalshi-teal] font-mono text-xs font-medium">{pct(kalshiYes)}</span>
                  </td>
                  <td className={`px-5 py-2.5 text-right font-mono text-xs hidden sm:table-cell ${spreadColor}`}>
                    {spread != null ? `${spread.toFixed(1)}%` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {matched.outcomes.length > 10 && (
        <p className="px-5 py-3 text-[10px] text-[--text-muted] border-t border-[--border-subtle]">
          Showing top 10 of {matched.outcomes.length} outcomes
        </p>
      )}
    </div>
  );
}

function ArbSection({ opps }: { opps: ArbitrageOpportunity[] }) {
  if (!opps.length) return null;
  return (
    <div className="surface rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-[--border-subtle] flex items-center gap-2">
        <Zap className="w-4 h-4 text-[--arb-amber]" />
        <h2 className="text-sm font-semibold text-[--text-primary]">Arbitrage Opportunities</h2>
        <span className="ml-auto text-xs text-[--text-muted]">{opps.length} found</span>
      </div>
      <div className="divide-y divide-[--border-subtle]">
        {opps.map((opp, i) => (
          <div key={i} className="px-5 py-3.5 flex items-center gap-4 hover:bg-[--surface-hover] transition-colors">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-[--text-primary] font-medium">{opp.poly_label}</p>
              <div className="flex items-center gap-2 mt-0.5 text-xs text-[--text-muted]">
                <span className="flex items-center gap-1">
                  <KalshiLogo size={11} /> {opp.kalshi_leg} @ {(opp.kalshi_ask * 100).toFixed(1)}¢
                </span>
                <span>+</span>
                <span className="flex items-center gap-1">
                  <PolymarketLogo size={11} /> {opp.poly_leg} @ {(opp.poly_ask * 100).toFixed(1)}¢
                </span>
              </div>
            </div>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold font-mono border text-emerald-600 dark:text-emerald-400 bg-emerald-500/8 border-emerald-500/20">
              <ArrowUpRight className="w-3 h-3" />+{opp.net_profit_pct.toFixed(1)}%
            </span>
            <div className="flex gap-2">
              {opp.poly_url && (
                <a href={opp.poly_url} target="_blank" rel="noopener noreferrer" className="text-[#1652F0] hover:opacity-70 transition-opacity">
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
              {opp.kalshi_url && (
                <a href={opp.kalshi_url} target="_blank" rel="noopener noreferrer" className="text-[--kalshi-teal] hover:opacity-70 transition-opacity">
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function EventDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const decodedSlug = decodeURIComponent(slug);

  const [event, setEvent]     = useState<AllEvent | null>(null);
  const [matched, setMatched] = useState<GroupedMarket | null>(null);
  const [arbOpps, setArbOpps] = useState<ArbitrageOpportunity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchAllEvents(),
      fetchMatchedMarkets(),
      fetchArbitrageOpportunities(),
    ]).then(([allEvents, matchedMarkets, arb]) => {
      const found = allEvents.find((e) => e.id === decodedSlug);
      setEvent(found ?? null);

      if (found) {
        const m = matchedMarkets.find((g) => g.poly_event === found.title);
        setMatched(m ?? null);

        const relatedArb = arb.filter((o) => o.poly_event === found.title);
        setArbOpps(relatedArb);
      }

      setLoading(false);
    });
  }, [decodedSlug]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-4">
        <div className="h-8 w-32 rounded-lg bg-[--surface] animate-pulse" />
        <div className="h-24 rounded-2xl bg-[--surface] animate-pulse" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-16 rounded-xl bg-[--surface] animate-pulse" />)}
        </div>
        <div className="h-48 rounded-2xl bg-[--surface] animate-pulse" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <p className="text-[--text-muted] text-sm mb-4">Market not found.</p>
        <Link href="/events" className="link-arrow text-xs text-[--text-secondary] flex items-center justify-center gap-1">
          <ArrowLeft className="w-3 h-3" /> Back to all markets
        </Link>
      </div>
    );
  }

  const hasPoly   = event.platforms.includes("polymarket");
  const hasKalshi = event.platforms.includes("kalshi");

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-[--text-muted] mb-6">
        <Link href="/" className="hover:text-[--text-primary] transition-colors">Home</Link>
        <span>/</span>
        <Link href="/events" className="hover:text-[--text-primary] transition-colors">All Markets</Link>
        <span>/</span>
        <span className="truncate max-w-[200px]">{event.title}</span>
      </div>

      {/* Hero */}
      <div className="surface rounded-2xl p-5 sm:p-6 mb-5">
        <div className="flex items-start gap-4">
          <EventIcon src={event.icon || null} alt={event.title} size={56} className="shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-[--text-primary] leading-snug mb-3">{event.title}</h1>

            {/* Platform badges + links */}
            <div className="flex flex-wrap items-center gap-3">
              {hasPoly && (
                <div className="flex items-center gap-2">
                  <PolymarketLogo size={18} />
                  <span className="text-sm text-[#1652F0] dark:text-[#5b8df8] font-medium">Polymarket</span>
                  {event.poly_url && (
                    <a href={event.poly_url} target="_blank" rel="noopener noreferrer"
                      className="text-[--text-muted] hover:text-[#1652F0] transition-colors">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              )}
              {hasKalshi && (
                <div className="flex items-center gap-2">
                  <KalshiLogo size={18} />
                  <span className="text-sm text-[--kalshi-teal] font-medium">Kalshi</span>
                  {event.kalshi_url && (
                    <a href={event.kalshi_url} target="_blank" rel="noopener noreferrer"
                      className="text-[--text-muted] hover:text-[--kalshi-teal] transition-colors">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              )}
              {event.is_matched && (
                <span className="text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-500/8 border border-emerald-500/20 px-2 py-0.5 rounded-full font-medium">
                  Matched {event.event_score != null ? `${Math.round(event.event_score * 100)}%` : ""}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <StatCard
          label="Total Volume"
          value={formatVolume(event.volume)}
          sub={event.volume_24h > 0 ? `${formatVolume(event.volume_24h)} / 24h` : undefined}
        />
        <StatCard
          label="Outcomes"
          value={String(event.num_outcomes)}
          sub={event.num_outcomes === 1 ? "Binary (Yes/No)" : "Multi-outcome"}
        />
        <StatCard
          label="Resolves"
          value={fmtDate(event.end_date)}
        />
        {(event.yes_price_poly != null || event.yes_price_kalshi != null) && (
          <StatCard
            label={event.yes_price_poly != null && event.yes_price_kalshi != null ? "YES (Poly / Kalshi)" : "Yes Probability"}
            value={
              event.yes_price_poly != null && event.yes_price_kalshi != null
                ? `${pct(event.yes_price_poly)} / ${pct(event.yes_price_kalshi)}`
                : pct(event.yes_price_poly ?? event.yes_price_kalshi)
            }
          />
        )}
      </div>

      {/* Odds / comparison */}
      <div className="mb-5">
        <OddsSection event={event} matched={matched} />
      </div>

      {/* Arb opportunities */}
      <div className="mb-5">
        <ArbSection opps={arbOpps} />
      </div>

      {/* Compare link (if matched) */}
      {event.is_matched && (
        <div className="surface rounded-xl px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[--text-muted]" />
            <span className="text-sm text-[--text-secondary]">
              This event is matched across both platforms.
            </span>
          </div>
          <Link
            href={`/markets`}
            className="link-arrow text-xs text-[--arb-amber] flex items-center gap-1"
          >
            View comparison <ArrowLeft className="w-3 h-3 rotate-180" />
          </Link>
        </div>
      )}

      {/* Back link */}
      <div className="mt-8 flex items-center gap-2">
        <Link href="/events" className="flex items-center gap-1.5 text-xs text-[--text-muted] hover:text-[--text-primary] transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to All Markets
        </Link>
      </div>
    </div>
  );
}
