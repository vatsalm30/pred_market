"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Zap, Search, Filter, ArrowUpRight, Info, ExternalLink, Radio, Calendar, AlertTriangle } from "lucide-react";
import { fetchArbitrageOpportunities, type ArbitrageOpportunity, categoryFromEvent } from "@/lib/csv";
import { PolymarketLogo, KalshiLogo } from "@/components/PlatformLogos";
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

function PriceCell({
  snapshotAsk,
  liveAsk,
  leg,
  platform,
}: {
  snapshotAsk: number;
  liveAsk?: number;
  leg: string;
  platform: "kalshi" | "poly";
}) {
  const isKalshi = platform === "kalshi";
  const isYes = leg === "YES";
  const displayAsk = liveAsk ?? snapshotAsk;
  const hasLive = liveAsk !== undefined;

  const legClass = isKalshi
    ? isYes ? "bg-teal-500/10 text-[--kalshi-teal]" : "bg-red-500/10 text-red-400"
    : isYes ? "bg-blue-500/10 text-[#1652F0] dark:text-[#5b8df8]" : "bg-orange-500/10 text-orange-400";

  const priceClass = isKalshi ? "text-[--kalshi-teal]" : "text-[#1652F0] dark:text-[#5b8df8]";

  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={`text-xs font-mono font-semibold px-2 py-0.5 rounded ${legClass}`}>
        {isKalshi ? "Kalshi" : "Poly"} {leg}
      </span>
      <span className={`text-xs font-mono ${hasLive ? priceClass + " font-semibold" : "text-[--text-muted]"}`}>
        {(displayAsk * 100).toFixed(1)}¢
        {hasLive && <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 live-dot align-middle" />}
      </span>
    </div>
  );
}

function DesktopRow({
  opp,
  liveKalshiAsk,
  livePolyAsk,
}: {
  opp: ArbitrageOpportunity;
  liveKalshiAsk?: number;
  livePolyAsk?: number;
}) {
  const category = categoryFromEvent(opp.poly_event);
  return (
    <tr className="border-b border-[--border-subtle] hover:bg-[--surface-hover] transition-colors group">
      <td className="px-5 py-4">
        <p className="text-[--text-primary] font-medium text-sm">{opp.poly_event}</p>
        <p className="text-[--text-muted] text-xs mt-0.5">{opp.poly_label}</p>
      </td>
      <td className="px-4 py-4">
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${CATEGORY_COLORS[category]}`}>
          {category}
        </span>
      </td>
      <td className="px-4 py-4 text-center">
        <PriceCell snapshotAsk={opp.kalshi_ask} liveAsk={liveKalshiAsk} leg={opp.kalshi_leg} platform="kalshi" />
      </td>
      <td className="px-4 py-4 text-center">
        <PriceCell snapshotAsk={opp.poly_ask} liveAsk={livePolyAsk} leg={opp.poly_leg} platform="poly" />
      </td>
      <td className="px-4 py-4 text-center">
        <span className="text-[--arb-amber] font-mono text-sm font-semibold">
          +{(opp.gross_spread * 100).toFixed(2)}¢
        </span>
      </td>
      <td className="px-4 py-4 text-center"><ProfitBadge pct={opp.net_profit_pct} /></td>
      <td className="px-4 py-4 text-center">
        {(() => {
          const diff = dateDiffDays(opp.poly_end_date, opp.kalshi_end_date);
          const mismatch = diff !== null && diff > 30;
          return (
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-[--text-secondary] text-xs font-mono tabular-nums">{fmtDate(opp.poly_end_date)}</span>
              {mismatch && (
                <span className="flex items-center gap-1 text-[10px] text-amber-500">
                  <AlertTriangle className="w-2.5 h-2.5" /> {Math.round(diff)}d off
                </span>
              )}
            </div>
          );
        })()}
      </td>
      <td className="px-4 py-4">
        <div className="row-actions flex items-center gap-3">
          <a href={opp.poly_url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-[#1652F0] dark:text-[#5b8df8] hover:opacity-70 transition-opacity">
            <PolymarketLogo size={13} /> <ExternalLink className="w-3 h-3" />
          </a>
          <a href={opp.kalshi_url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-[--kalshi-teal] hover:opacity-70 transition-opacity">
            <KalshiLogo size={13} /> <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </td>
    </tr>
  );
}

function MobileCard({
  opp,
  liveKalshiAsk,
  livePolyAsk,
}: {
  opp: ArbitrageOpportunity;
  liveKalshiAsk?: number;
  livePolyAsk?: number;
}) {
  const category = categoryFromEvent(opp.poly_event);
  return (
    <div className="mobile-arb-card surface rounded-xl p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-[--text-primary] font-medium text-sm leading-snug">{opp.poly_event}</p>
          <p className="text-[--text-muted] text-xs mt-0.5">{opp.poly_label}</p>
        </div>
        <ProfitBadge pct={opp.net_profit_pct} />
      </div>
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${CATEGORY_COLORS[category]}`}>{category}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-[--bg-subtle] rounded-lg p-2.5">
          <div className="flex items-center gap-1 mb-1">
            <PolymarketLogo size={12} />
            <span className="text-[--text-muted] text-xs">{opp.poly_leg}</span>
          </div>
          <div className="text-[#1652F0] dark:text-[#5b8df8] font-mono font-semibold text-sm">
            {((livePolyAsk ?? opp.poly_ask) * 100).toFixed(1)}¢
            {livePolyAsk !== undefined && <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 live-dot align-middle" />}
          </div>
        </div>
        <div className="bg-[--bg-subtle] rounded-lg p-2.5">
          <div className="flex items-center gap-1 mb-1">
            <KalshiLogo size={12} />
            <span className="text-[--text-muted] text-xs">{opp.kalshi_leg}</span>
          </div>
          <div className="text-[--kalshi-teal] font-mono font-semibold text-sm">
            {((liveKalshiAsk ?? opp.kalshi_ask) * 100).toFixed(1)}¢
            {liveKalshiAsk !== undefined && <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 live-dot align-middle" />}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[--arb-amber] font-mono text-xs">Spread: +{(opp.gross_spread * 100).toFixed(2)}¢</span>
        <div className="flex gap-3">
          <a href={opp.poly_url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-[#1652F0] dark:text-[#5b8df8]">
            <PolymarketLogo size={13} /> <ExternalLink className="w-3 h-3" />
          </a>
          <a href={opp.kalshi_url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-[--kalshi-teal]">
            <KalshiLogo size={13} /> <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
      {(() => {
        const diff = dateDiffDays(opp.poly_end_date, opp.kalshi_end_date);
        const mismatch = diff !== null && diff > 30;
        return (
          <div className="flex items-center gap-1.5 text-[--text-muted] text-[10px]">
            <Calendar className="w-3 h-3" />
            <span className="font-mono">{fmtDate(opp.poly_end_date)}</span>
            {mismatch && (
              <span className="flex items-center gap-0.5 text-amber-500">
                <AlertTriangle className="w-2.5 h-2.5" /> {Math.round(diff)}d off
              </span>
            )}
          </div>
        );
      })()}
    </div>
  );
}

function ArbitrageContent() {
  const searchParams = useSearchParams();
  const [opps, setOpps] = useState<ArbitrageOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get("event") || "");
  const [category, setCategory] = useState("All");
  const [minProfit, setMinProfit] = useState(0);
  const [sortBy, setSortBy] = useState<"profit" | "spread" | "match" | "date">("profit");

  useEffect(() => {
    fetchArbitrageOpportunities().then((d) => { setOpps(d); setLoading(false); });
  }, []);

  const kalshiTickers = useMemo(() => [...new Set(opps.map((o) => o.kalshi_market_id))], [opps]);
  const polyIds = useMemo(() => [...new Set(opps.map((o) => o.poly_market_id))], [opps]);
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
          return b.outcome_score - a.outcome_score;
        }),
    [opps, search, category, minProfit, sortBy]
  );

  const topProfit = opps.length ? Math.max(...opps.map((o) => o.net_profit_pct)) : 0;
  const categories = ["All", "Politics", "Sports", "Economics", "Tech", "Other"];

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
              <Radio className="w-3.5 h-3.5" />
              Kalshi live
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-[--text-muted]">
              <span className="w-1.5 h-1.5 rounded-full bg-[--text-muted]" />
              30-min snapshot
            </span>
          )}
        </div>
      </div>

      {/* Inline stats */}
      <div className="flex flex-wrap gap-6 mb-8 text-sm text-[--text-secondary]">
        <span><strong className="text-[--text-primary] font-semibold tabular-nums">{loading ? "—" : opps.length}</strong> total opportunities</span>
        <span><strong className="text-[--arb-amber] font-semibold tabular-nums">{loading ? "—" : topProfit.toFixed(0)}%</strong> highest profit*</span>
        <span><strong className="text-[--text-primary] font-semibold tabular-nums">{loading ? "—" : filtered.length}</strong> showing now</span>
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
            {(["profit", "spread", "date", "match"] as const).map((s) => (
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
        <p className="text-[--text-muted] text-xs mb-4">{filtered.length} opportunities</p>
      )}

      {loading ? (
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => <div key={i} className="surface rounded-xl h-14 animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-24 text-[--text-muted]">
          <Zap className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm">No opportunities match your filters.</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden lg:block surface rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[--border-subtle]">
                    <th className="text-left px-5 py-3.5 text-[--text-muted] font-medium text-xs">Event / Outcome</th>
                    <th className="text-left px-4 py-3.5 text-[--text-muted] font-medium text-xs">Category</th>
                    <th className="text-center px-4 py-3.5 text-[--text-muted] font-medium text-xs">
                      <span className="flex items-center justify-center gap-1"><KalshiLogo size={12} /> Kalshi</span>
                    </th>
                    <th className="text-center px-4 py-3.5 text-[--text-muted] font-medium text-xs">
                      <span className="flex items-center justify-center gap-1"><PolymarketLogo size={12} /> Poly</span>
                    </th>
                    <th className="text-center px-4 py-3.5 text-[--text-muted] font-medium text-xs">Spread</th>
                    <th className="text-center px-4 py-3.5 text-[--text-muted] font-medium text-xs">Net Profit</th>
                    <th className="text-center px-4 py-3.5 text-[--text-muted] font-medium text-xs">
                      <span className="flex items-center justify-center gap-1"><Calendar className="w-3 h-3" /> Resolves</span>
                    </th>
                    <th className="w-16" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((opp, i) => (
                    <DesktopRow
                      key={i}
                      opp={opp}
                      liveKalshiAsk={liveKalshi.get(opp.kalshi_market_id)?.yes_ask}
                      livePolyAsk={livePoly.get(opp.poly_market_id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="lg:hidden space-y-3">
            {filtered.map((opp, i) => (
              <MobileCard
                key={i}
                opp={opp}
                liveKalshiAsk={liveKalshi.get(opp.kalshi_market_id)?.yes_ask}
                livePolyAsk={livePoly.get(opp.poly_market_id)}
              />
            ))}
          </div>
        </>
      )}

      {!loading && (
        <p className="text-[--text-muted] text-xs mt-6">
          * Very high profit % values may reflect stale data or market edge cases. Always verify prices directly.
        </p>
      )}

      {/* Platform links */}
      <div className="mt-10 flex flex-col sm:flex-row items-center gap-4">
        <span className="text-[--text-muted] text-xs">Trade on:</span>
        <a href="https://polymarket.com" target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-2 rounded-xl surface hover:bg-[--surface-hover] transition-colors text-sm">
          <PolymarketLogo size={18} />
          <span className="text-[#1652F0] dark:text-[#5b8df8] font-medium">Polymarket</span>
          <ExternalLink className="w-3 h-3 text-[--text-muted]" />
        </a>
        <a href="https://kalshi.com" target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-2 rounded-xl surface hover:bg-[--surface-hover] transition-colors text-sm">
          <KalshiLogo size={18} />
          <span className="text-[--kalshi-teal] font-medium">Kalshi</span>
          <ExternalLink className="w-3 h-3 text-[--text-muted]" />
        </a>
      </div>
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
