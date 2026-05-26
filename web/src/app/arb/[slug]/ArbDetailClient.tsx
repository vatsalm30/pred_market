"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { ExternalLink, ArrowLeft, Calendar, Zap, ArrowUpRight, AlertTriangle, Radio } from "lucide-react";
import {
  fetchArbitrageOpportunities, fetchAllEvents,
  type ArbitrageOpportunity, type AllEvent,
  formatVolume, categoryFromEvent,
} from "@/lib/csv";
import { PolymarketLogo, KalshiLogo } from "@/components/PlatformLogos";
import EventIcon from "@/components/EventIcon";
import { useLivePrices } from "@/hooks/useLivePrices";

const CATEGORY_COLORS: Record<string, string> = {
  Politics:  "text-blue-500  dark:text-blue-400  bg-blue-500/8   border-blue-500/20",
  Sports:    "text-emerald-600 dark:text-emerald-400 bg-emerald-500/8 border-emerald-500/20",
  Economics: "text-amber-600  dark:text-amber-400  bg-amber-500/8  border-amber-500/20",
  Tech:      "text-violet-600 dark:text-violet-400 bg-violet-500/8 border-violet-500/20",
  Other:     "text-[--text-muted] bg-[--bg-subtle] border-[--border]",
};

function fmtDate(d?: string): string {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00Z");
  if (isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function dateDiffDays(a?: string, b?: string): number | null {
  if (!a || !b) return null;
  const da = new Date(a + "T00:00:00Z").getTime();
  const db = new Date(b + "T00:00:00Z").getTime();
  if (isNaN(da) || isNaN(db)) return null;
  return Math.abs(da - db) / (1000 * 60 * 60 * 24);
}

function StatBox({
  label, value, sub, highlight,
}: {
  label: string; value: string; sub?: string; highlight?: string;
}) {
  return (
    <div className="surface rounded-xl px-4 py-3">
      <p className="text-[--text-muted] text-[10px] uppercase tracking-widest font-medium mb-1">{label}</p>
      <p className={`text-lg font-bold tabular-nums font-mono ${highlight ?? "text-[--text-primary]"}`}>{value}</p>
      {sub && <p className="text-[--text-muted] text-[11px] mt-0.5">{sub}</p>}
    </div>
  );
}

export default function ArbDetailClient({ slug }: { slug: string }) {
  const decodedSlug = decodeURIComponent(slug);

  const [opp, setOpp]     = useState<ArbitrageOpportunity | null>(null);
  const [event, setEvent] = useState<AllEvent | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchArbitrageOpportunities(), fetchAllEvents()]).then(([arb, allEvents]) => {
      const found = arb.find((o) => o.kalshi_market_id === decodedSlug);
      setOpp(found ?? null);
      if (found) {
        setEvent(allEvents.find((e) => e.title === found.poly_event) ?? null);
      }
      setLoading(false);
    });
  }, [decodedSlug]);

  const kalshiTickers = useMemo(() => (opp ? [opp.kalshi_market_id] : []), [opp]);
  const polyIds       = useMemo(() => (opp ? [opp.poly_market_id]   : []), [opp]);
  const { kalshi: liveKalshi, poly: livePoly, connected: liveConnected } = useLivePrices(kalshiTickers, polyIds);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-4">
        <div className="h-6 w-40 rounded bg-[--surface] animate-pulse" />
        <div className="h-28 rounded-2xl bg-[--surface] animate-pulse" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-16 rounded-xl bg-[--surface] animate-pulse" />)}
        </div>
        <div className="h-48 rounded-2xl bg-[--surface] animate-pulse" />
      </div>
    );
  }

  if (!opp) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <p className="text-[--text-muted] text-sm mb-4">Opportunity not found.</p>
        <Link href="/arbitrage" className="flex items-center justify-center gap-1 text-xs text-[--text-secondary] hover:text-[--text-primary] transition-colors">
          <ArrowLeft className="w-3 h-3" /> Back to Arbitrage
        </Link>
      </div>
    );
  }

  const liveKalshiAsk = opp.kalshi_leg === "YES"
    ? liveKalshi.get(opp.kalshi_market_id)?.yes_ask
    : liveKalshi.get(opp.kalshi_market_id)?.no_ask;
  const livePolyAsk   = livePoly.get(opp.poly_market_id);
  const displayKalshi = liveKalshiAsk ?? opp.kalshi_ask;
  const displayPoly   = livePolyAsk   ?? opp.poly_ask;
  const liveSpread    = 1 - displayKalshi - displayPoly;
  const liveProfit    = liveSpread > 0 ? (liveSpread / (displayKalshi + displayPoly)) * 100 : null;

  const category = categoryFromEvent(opp.poly_event);
  const catClass  = CATEGORY_COLORS[category];
  const diff      = dateDiffDays(opp.poly_end_date, opp.kalshi_end_date);
  const mismatch  = diff !== null && diff > 30;

  const isLive = liveKalshiAsk !== undefined || livePolyAsk !== undefined;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-[--text-muted] mb-6 flex-wrap">
        <Link href="/" className="hover:text-[--text-primary] transition-colors">Home</Link>
        <span>/</span>
        <Link href="/arbitrage" className="hover:text-[--text-primary] transition-colors">Arbitrage</Link>
        <span>/</span>
        <span className="truncate max-w-[200px]">{opp.poly_label}</span>
      </div>

      {/* Hero */}
      <div className="surface rounded-2xl p-5 sm:p-6 mb-5">
        <div className="flex items-start gap-4">
          <EventIcon src={opp.event_icon || null} alt={opp.poly_event} size={52} className="shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <span className={`text-[10px] font-medium px-1.5 py-px rounded-full border ${catClass}`}>{category}</span>
              {liveConnected ? (
                <span className="flex items-center gap-1 text-xs text-emerald-500 font-medium">
                  <Radio className="w-3 h-3" /> Kalshi live
                </span>
              ) : (
                <span className="text-[10px] text-[--text-muted]">30-min snapshot</span>
              )}
            </div>
            <h1 className="text-lg sm:text-xl font-bold text-[--text-primary] leading-snug mb-1">{opp.poly_event}</h1>
            <p className="text-[--text-secondary] text-sm mb-3">{opp.poly_label}</p>
            <div className="flex items-center gap-4 flex-wrap">
              <a href={opp.poly_url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-[#1652F0] dark:text-[#5b8df8] hover:opacity-70 transition-opacity">
                <PolymarketLogo size={14} /> Polymarket <ExternalLink className="w-3 h-3" />
              </a>
              <a href={opp.kalshi_url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-[--kalshi-teal] hover:opacity-70 transition-opacity">
                <KalshiLogo size={14} /> Kalshi <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <StatBox
          label="Net Profit"
          value={`+${(liveProfit ?? opp.net_profit_pct).toFixed(1)}%`}
          highlight="text-emerald-500 dark:text-emerald-400"
          sub={isLive ? "live estimate" : "snapshot"}
        />
        <StatBox
          label="Spread"
          value={`+${(liveSpread * 100).toFixed(2)}¢`}
          highlight="text-[--arb-amber]"
          sub={`Cost: ${((displayKalshi + displayPoly) * 100).toFixed(1)}¢`}
        />
        <StatBox
          label="Resolves"
          value={fmtDate(opp.poly_end_date)}
          sub={mismatch ? `Kalshi: ${fmtDate(opp.kalshi_end_date)}` : undefined}
        />
        <StatBox
          label="Match Score"
          value={`${Math.round(opp.outcome_score * 100)}%`}
          sub={`Event: ${Math.round(opp.event_score * 100)}%`}
        />
      </div>

      {/* Volume row */}
      {((opp.poly_volume ?? 0) > 0 || (opp.kalshi_volume ?? 0) > 0) && (
        <div className="grid grid-cols-2 gap-3 mb-5">
          {(opp.poly_volume ?? 0) > 0 && (
            <StatBox label="Poly Volume" value={formatVolume(opp.poly_volume ?? 0)} />
          )}
          {(opp.kalshi_volume ?? 0) > 0 && (
            <StatBox label="Kalshi Volume" value={formatVolume(opp.kalshi_volume ?? 0)} />
          )}
        </div>
      )}

      {/* Date mismatch warning */}
      {mismatch && (
        <div className="flex items-start gap-2 bg-amber-500/5 border border-amber-500/20 rounded-xl px-4 py-3 mb-5 text-amber-600 dark:text-amber-400">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <p className="text-xs leading-relaxed">
            Resolution dates differ by {Math.round(diff!)} days. Poly resolves {fmtDate(opp.poly_end_date)}, Kalshi resolves {fmtDate(opp.kalshi_end_date)}. Confirm before trading.
          </p>
        </div>
      )}

      {/* Arb legs */}
      <div className="surface rounded-2xl overflow-hidden mb-5">
        <div className="px-5 py-4 border-b border-[--border-subtle]">
          <h2 className="text-sm font-semibold text-[--text-primary]">Arbitrage Legs</h2>
          <p className="text-xs text-[--text-muted] mt-0.5">
            Buy both legs — one always wins. Combined cost: {((displayKalshi + displayPoly) * 100).toFixed(1)}¢ per $1.
          </p>
        </div>
        <div className="px-5 py-5 space-y-5">
          {/* Kalshi leg */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <KalshiLogo size={14} />
              <span className="text-sm text-[--text-secondary] font-medium">Kalshi — Buy {opp.kalshi_leg}</span>
              <span className="ml-auto font-mono text-sm font-bold text-[--kalshi-teal] flex items-center gap-1.5">
                {(displayKalshi * 100).toFixed(1)}¢
                {liveKalshiAsk !== undefined && <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 live-dot" />}
              </span>
            </div>
            <div className="relative h-5 rounded-full bg-[--bg-subtle] overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 rounded-full transition-all"
                style={{ width: `${Math.min(displayKalshi * 100, 99)}%`, minWidth: "8px", background: "#00B3A1CC" }}
              />
            </div>
          </div>

          {/* Poly leg */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <PolymarketLogo size={14} />
              <span className="text-sm text-[--text-secondary] font-medium">Polymarket — Buy {opp.poly_leg}</span>
              <span className="ml-auto font-mono text-sm font-bold text-[#1652F0] dark:text-[#5b8df8] flex items-center gap-1.5">
                {(displayPoly * 100).toFixed(1)}¢
                {livePolyAsk !== undefined && <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 live-dot" />}
              </span>
            </div>
            <div className="relative h-5 rounded-full bg-[--bg-subtle] overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 rounded-full transition-all"
                style={{ width: `${Math.min(displayPoly * 100, 99)}%`, minWidth: "8px", background: "#1652F0CC" }}
              />
            </div>
          </div>

          {/* Profit */}
          {liveSpread > 0 && (
            <div className="flex items-center gap-2 pt-3 border-t border-[--border-subtle]">
              <Zap className="w-4 h-4 text-[--arb-amber] shrink-0" />
              <span className="text-sm text-[--text-secondary] font-medium">Profit on resolution</span>
              <span className="ml-auto font-mono text-sm font-bold text-[--arb-amber]">
                +{(liveSpread * 100).toFixed(2)}¢ per $1
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Parent event */}
      {event && (
        <div className="surface rounded-xl px-4 py-3.5 flex items-center gap-3 mb-5">
          <EventIcon src={opp.event_icon || null} alt={opp.poly_event} size={32} className="shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-[--text-muted] mb-0.5">Parent event</p>
            <p className="text-sm text-[--text-primary] font-medium truncate">{event.title}</p>
            {event.volume > 0 && (
              <p className="text-[10px] text-[--text-muted] mt-0.5">
                {formatVolume(event.volume)} total · {formatVolume(event.volume_24h)}/24h
              </p>
            )}
          </div>
          <Link
            href={`/events/${encodeURIComponent(event.id)}`}
            className="link-arrow text-xs text-[--text-secondary] hover:text-[--text-primary] flex items-center gap-1 shrink-0"
          >
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

      {/* Calendar */}
      <div className="surface rounded-xl px-4 py-3.5 flex items-center gap-3 mb-5">
        <Calendar className="w-4 h-4 text-[--text-muted] shrink-0" />
        <div className="flex-1">
          <div className="flex items-center gap-4 text-sm">
            <span>
              <span className="text-[#1652F0] dark:text-[#5b8df8] text-xs font-medium mr-1.5">Poly</span>
              <span className="text-[--text-primary] font-medium">{fmtDate(opp.poly_end_date)}</span>
            </span>
            <span>
              <span className="text-[--kalshi-teal] text-xs font-medium mr-1.5">Kalshi</span>
              <span className="text-[--text-primary] font-medium">{fmtDate(opp.kalshi_end_date)}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Disclaimer */}
      <p className="text-[--text-muted] text-[10px] leading-relaxed mb-6">
        Kalshi prices update live via WebSocket. Polymarket prices reflect the last pipeline snapshot (~30 min). Always verify directly on both platforms before trading. Not financial advice.
      </p>

      {/* Back */}
      <Link href="/arbitrage" className="flex items-center gap-1.5 text-xs text-[--text-muted] hover:text-[--text-primary] transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Arbitrage Scanner
      </Link>
    </div>
  );
}
