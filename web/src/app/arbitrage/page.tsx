"use client";

import { useEffect, useState, useMemo, useRef, useCallback, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Zap, Search, Filter, ArrowUpRight, Info, ExternalLink, Radio, Calendar, AlertTriangle, ArrowRight } from "lucide-react";
import { fetchArbitrageOpportunities, type ArbitrageOpportunity, categoryFromEvent, formatVolume } from "@/lib/csv";
import { PolymarketLogo, KalshiLogo } from "@/components/PlatformLogos";
import EventIcon from "@/components/EventIcon";
import { useLivePrices } from "@/hooks/useLivePrices";

function fmtDate(d?: string): string {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00Z");
  if (isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function dateDiffDays(a?: string, b?: string): number | null {
  if (!a || !b) return null;
  const da = new Date(a + "T00:00:00Z").getTime();
  const db = new Date(b + "T00:00:00Z").getTime();
  if (isNaN(da) || isNaN(db)) return null;
  return Math.abs(da - db) / (1000 * 60 * 60 * 24);
}

const CATEGORY_COLORS: Record<string, string> = {
  Politics:  "text-blue-500  dark:text-blue-400  bg-blue-500/8   border-blue-500/20",
  Sports:    "text-emerald-600 dark:text-emerald-400 bg-emerald-500/8 border-emerald-500/20",
  Economics: "text-amber-600  dark:text-amber-400  bg-amber-500/8  border-amber-500/20",
  Tech:      "text-violet-600 dark:text-violet-400 bg-violet-500/8 border-violet-500/20",
  Other:     "text-[--text-muted] bg-[--bg-subtle] border-[--border]",
};

function ProfitBadge({ pct }: { pct: number }) {
  const color =
    pct > 50 ? "text-emerald-600 dark:text-emerald-300 bg-emerald-500/8 border-emerald-500/20"
    : pct > 20 ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/6 border-emerald-500/15"
    : pct > 5  ? "text-amber-600  dark:text-amber-400  bg-amber-500/8  border-amber-500/20"
    :            "text-orange-600 dark:text-orange-400 bg-orange-500/8 border-orange-500/20";
  return (
    <span className={`profit-badge inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold font-mono border ${color}`}>
      <ArrowUpRight className="w-3 h-3" />+{pct.toFixed(1)}%
    </span>
  );
}

function ArbCard({
  opp,
  liveKalshiAsk,
  livePolyAsk,
}: {
  opp: ArbitrageOpportunity;
  liveKalshiAsk?: number;
  livePolyAsk?: number;
}) {
  const category = categoryFromEvent(opp.poly_event);
  const catClass  = CATEGORY_COLORS[category];
  const slug      = encodeURIComponent(opp.kalshi_market_id);
  const diff      = dateDiffDays(opp.poly_end_date, opp.kalshi_end_date);
  const mismatch  = diff !== null && diff > 30;

  const displayKalshi = liveKalshiAsk ?? opp.kalshi_ask;
  const displayPoly   = livePolyAsk   ?? opp.poly_ask;

  return (
    <div className="market-card surface rounded-2xl overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-4 py-4 border-b border-[--border-subtle]">
        <div className="flex items-start gap-3">
          <EventIcon src={opp.event_icon} alt={opp.poly_event} size={40} className="shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className={`text-[10px] font-medium px-1.5 py-px rounded-full border ${catClass}`}>
                {category}
              </span>
              <ProfitBadge pct={opp.net_profit_pct} />
            </div>
            <h3 className="text-[--text-primary] text-sm font-semibold leading-snug line-clamp-2">
              {opp.poly_event}
            </h3>
            <p className="text-[--text-muted] text-xs mt-0.5 truncate">{opp.poly_label}</p>
          </div>
        </div>
      </div>

      {/* Price boxes */}
      <div className="px-4 py-3 grid grid-cols-2 gap-2 flex-1">
        <div className="bg-[--bg-subtle] rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <KalshiLogo size={12} />
            <span className="text-[--text-muted] text-xs">Kalshi {opp.kalshi_leg}</span>
          </div>
          <div className="text-[--kalshi-teal] font-mono font-bold text-lg leading-none">
            {(displayKalshi * 100).toFixed(1)}¢
          </div>
          {liveKalshiAsk !== undefined && (
            <div className="flex items-center gap-1 mt-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 live-dot" />
              <span className="text-[10px] text-emerald-500">live</span>
            </div>
          )}
        </div>
        <div className="bg-[--bg-subtle] rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <PolymarketLogo size={12} />
            <span className="text-[--text-muted] text-xs">Poly {opp.poly_leg}</span>
          </div>
          <div className="text-[#1652F0] dark:text-[#5b8df8] font-mono font-bold text-lg leading-none">
            {(displayPoly * 100).toFixed(1)}¢
          </div>
          {livePolyAsk !== undefined && (
            <div className="flex items-center gap-1 mt-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 live-dot" />
              <span className="text-[10px] text-emerald-500">live</span>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-2.5 flex items-center justify-between border-t border-[--border-subtle] bg-[--bg-subtle]">
        <div className="flex items-center gap-3 text-[10px] text-[--text-muted]">
          <span className="text-[--arb-amber] font-mono font-medium">
            +{(opp.gross_spread * 100).toFixed(2)}¢
          </span>
          {opp.poly_end_date && (
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {fmtDate(opp.poly_end_date)}
            </span>
          )}
          {mismatch && (
            <span className="flex items-center gap-0.5 text-amber-500">
              <AlertTriangle className="w-3 h-3" /> {Math.round(diff!)}d off
            </span>
          )}
          <div className="flex items-center gap-1.5">
            <a href={opp.poly_url} target="_blank" rel="noopener noreferrer"
              aria-label="View on Polymarket"
              className="text-[#1652F0] dark:text-[#5b8df8] hover:opacity-70 transition-opacity">
              <ExternalLink className="w-3 h-3" />
            </a>
            <a href={opp.kalshi_url} target="_blank" rel="noopener noreferrer"
              aria-label="View on Kalshi"
              className="text-[--kalshi-teal] hover:opacity-70 transition-opacity">
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
        <Link
          href={`/arb/${slug}`}
          className="link-arrow text-[10px] text-[--text-secondary] hover:text-[--arb-amber] flex items-center gap-0.5 transition-colors shrink-0"
        >
          Details <ArrowRight className="w-2.5 h-2.5" />
        </Link>
      </div>
    </div>
  );
}

const PAGE_SIZE = 24;

function ArbitrageContent() {
  const searchParams = useSearchParams();
  const [opps, setOpps]       = useState<ArbitrageOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState(searchParams.get("event") || "");
  const [category, setCategory] = useState("All");
  const [minProfit, setMinProfit] = useState(0);
  const [sortBy, setSortBy]   = useState<"profit" | "spread" | "match" | "date" | "volume">("profit");
  const [page, setPage]       = useState(1);
  const sentinelRef           = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchArbitrageOpportunities().then((d) => { setOpps(d); setLoading(false); });
  }, []);

  useEffect(() => { setPage(1); }, [search, category, minProfit, sortBy]);

  const kalshiTickers = useMemo(() => [...new Set(opps.map((o) => o.kalshi_market_id))], [opps]);
  const polyIds       = useMemo(() => [...new Set(opps.map((o) => o.poly_market_id))], [opps]);
  const { kalshi: liveKalshi, poly: livePoly, connected: liveConnected } = useLivePrices(kalshiTickers, polyIds);

  const filtered = useMemo(
    () =>
      opps
        .filter((o) => {
          const matchSearch =
            !search ||
            o.poly_event.toLowerCase().includes(search.toLowerCase()) ||
            o.poly_label.toLowerCase().includes(search.toLowerCase());
          const matchCat = category === "All" || categoryFromEvent(o.poly_event) === category;
          return matchSearch && matchCat && o.net_profit_pct >= minProfit;
        })
        .sort((a, b) => {
          if (sortBy === "profit") return b.net_profit_pct - a.net_profit_pct;
          if (sortBy === "spread") return b.gross_spread - a.gross_spread;
          if (sortBy === "date") {
            const da = a.poly_end_date || "9999-12-31";
            const db = b.poly_end_date || "9999-12-31";
            return da < db ? -1 : da > db ? 1 : 0;
          }
          if (sortBy === "volume") return (b.poly_volume || 0) - (a.poly_volume || 0);
          return b.outcome_score - a.outcome_score;
        }),
    [opps, search, category, minProfit, sortBy]
  );

  const hasMore = page * PAGE_SIZE < filtered.length;

  const loadMore = useCallback(() => { if (hasMore) setPage((p) => p + 1); }, [hasMore]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) loadMore(); }, { rootMargin: "200px" });
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadMore]);

  const topProfit  = opps.length ? Math.max(...opps.map((o) => o.net_profit_pct)) : 0;
  const categories = ["All", "Politics", "Sports", "Economics", "Tech", "Other"];
  const totalVol   = opps.reduce((s, o) => s + (o.poly_volume || 0), 0);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 text-xs text-[--text-muted] mb-5">
          <Link href="/" className="hover:text-[--text-primary] transition-colors">Home</Link>
          <span>/</span>
          <span>Arbitrage Scanner</span>
        </div>

        <div className="flex items-start gap-4 mb-4">
          <div className="w-11 h-11 rounded-2xl bg-[--arb-amber]/10 border border-[--arb-amber]/20 flex items-center justify-center mt-0.5 shrink-0">
            <Zap className="w-5 h-5 text-[--arb-amber]" />
          </div>
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-[--text-primary] leading-tight">Arbitrage Scanner</h1>
            <p className="text-[--text-secondary] text-sm mt-1">
              Pricing gaps between{" "}
              <span className="inline-flex items-center gap-1"><PolymarketLogo size={14} /> Polymarket</span>
              {" "}and{" "}
              <span className="inline-flex items-center gap-1"><KalshiLogo size={14} /> Kalshi</span>.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-start gap-2.5 bg-[--arb-amber]/5 border border-[--arb-amber]/15 rounded-xl px-4 py-3 max-w-2xl">
            <Info className="w-4 h-4 text-[--arb-amber] shrink-0 mt-0.5" />
            <p className="text-[--text-secondary] text-xs leading-relaxed">
              Prices change fast and gaps close. Verify on both platforms before acting. Not financial advice.
            </p>
          </div>
          {liveConnected ? (
            <span className="flex items-center gap-1.5 text-xs text-emerald-500 font-medium">
              <Radio className="w-3.5 h-3.5" /> Kalshi live
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-[--text-muted]">
              <span className="w-1.5 h-1.5 rounded-full bg-[--text-muted]" /> Snapshot
            </span>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="flex flex-wrap gap-6 mb-8 text-sm text-[--text-secondary]">
        <span><strong className="text-[--text-primary] font-semibold tabular-nums">{loading ? "—" : opps.length}</strong> total opportunities</span>
        <span><strong className="text-[--arb-amber] font-semibold tabular-nums">{loading ? "—" : topProfit.toFixed(0)}%</strong> highest profit*</span>
        {(loading || totalVol > 0) && (
          <span><strong className="text-[--text-primary] font-semibold">{loading ? "—" : formatVolume(totalVol)}</strong> total Poly vol</span>
        )}
      </div>

      {/* Filters */}
      <div className="sticky top-14 z-10 py-3 bg-[--bg]/90 backdrop-blur-xl -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 border-b border-[--border-subtle] mb-5 space-y-2.5">
        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[--text-muted]" />
            <input
              type="text"
              placeholder="Search events or outcomes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg bg-[--surface] border border-[--border] text-[--text-primary] text-sm placeholder-[--text-muted] focus:outline-none focus:border-[--text-muted] transition-colors"
            />
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[--text-muted] text-xs shrink-0">Min:</span>
            {[0, 5, 10, 20].map((v) => (
              <button key={v} onClick={() => setMinProfit(v)}
                className={`btn-pill px-2.5 py-1.5 rounded-lg text-xs font-medium ${
                  minProfit === v
                    ? "bg-[--surface] text-[--text-primary] border border-[--border]"
                    : "text-[--text-muted] hover:text-[--text-primary]"
                }`}
              >
                {v === 0 ? "All" : `>${v}%`}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Filter className="w-3.5 h-3.5 text-[--text-muted] shrink-0" />
            {categories.map((c) => (
              <button key={c} onClick={() => setCategory(c)}
                className={`btn-pill px-2.5 py-1.5 rounded-lg text-xs font-medium ${
                  category === c
                    ? "bg-[--surface] text-[--text-primary] border border-[--border]"
                    : "text-[--text-muted] hover:text-[--text-primary]"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[--text-muted] text-xs">Sort:</span>
            {(["profit", "spread", "volume", "date", "match"] as const).map((s) => (
              <button key={s} onClick={() => setSortBy(s)}
                className={`btn-pill px-2.5 py-1.5 rounded-lg text-xs font-medium capitalize ${
                  sortBy === s
                    ? "bg-[--surface] text-[--text-primary] border border-[--border]"
                    : "text-[--text-muted] hover:text-[--text-primary]"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!loading && (
        <p className="text-[--text-muted] text-xs mb-5">
          {Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} opportunities
        </p>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(9)].map((_, i) => (
            <div key={i} className="surface rounded-2xl h-52 animate-pulse" style={{ opacity: 1 - i * 0.07 }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-24 text-[--text-muted]">
          <Zap className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm">No opportunities match your filters.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.slice(0, page * PAGE_SIZE).map((opp, i) => (
              <ArbCard
                key={i}
                opp={opp}
                liveKalshiAsk={liveKalshi.get(opp.kalshi_market_id)?.yes_ask}
                livePolyAsk={livePoly.get(opp.poly_market_id)}
              />
            ))}
          </div>

          <div ref={sentinelRef} className="h-8" />

          {hasMore && (
            <div className="flex justify-center mt-2">
              <button
                onClick={() => setPage((p) => p + 1)}
                className="btn-pill px-4 py-2 text-xs text-[--text-muted] hover:text-[--text-primary] border border-[--border] rounded-lg"
              >
                Load more ({filtered.length - page * PAGE_SIZE} remaining)
              </button>
            </div>
          )}
        </>
      )}

      {!loading && (
        <p className="text-[--text-muted] text-xs mt-6">
          * Very high profit % values may reflect stale data or market edge cases. Always verify prices directly.
        </p>
      )}
    </div>
  );
}

export default function ArbitragePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-40 text-[--text-muted] text-sm">Loading...</div>}>
      <ArbitrageContent />
    </Suspense>
  );
}
