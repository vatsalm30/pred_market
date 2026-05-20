"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Search, TrendingUp, Filter, ChevronDown, ChevronUp, ArrowRight, ExternalLink } from "lucide-react";
import { fetchMatchedMarkets, type GroupedMarket, type MatchedMarket, categoryFromEvent } from "@/lib/csv";
import { PolymarketLogo, KalshiLogo } from "@/components/PlatformLogos";

const CATEGORY_COLORS: Record<string, string> = {
  Politics:  "text-blue-500  dark:text-blue-400  bg-blue-500/8   border-blue-500/20",
  Sports:    "text-emerald-600 dark:text-emerald-400 bg-emerald-500/8 border-emerald-500/20",
  Economics: "text-amber-600  dark:text-amber-400  bg-amber-500/8  border-amber-500/20",
  Tech:      "text-violet-600 dark:text-violet-400 bg-violet-500/8 border-violet-500/20",
  Other:     "text-[--text-muted] bg-[--bg-subtle] border-[--border]",
};

function pct(v: number | undefined): string {
  if (v == null) return "—";
  return (v * 100).toFixed(v < 0.1 ? 1 : 0) + "%";
}

// ── Binary odds chart (1–2 outcomes, e.g. "Will X happen?") ──────────────────
// Shows two full-width split bars: [YES ██████░░ NO] for each platform.
function BinaryOddsChart({ outcomes }: { outcomes: MatchedMarket[] }) {
  const o = outcomes[0];
  const polyYes   = o.poly_yes_ask   as number | undefined;
  const kalshiYes = o.kalshi_yes_ask as number | undefined;
  if (polyYes == null && kalshiYes == null) return null;

  const rows = [
    { label: "Polymarket", yes: polyYes,   color: "#1652F0", logo: <PolymarketLogo size={13} /> },
    { label: "Kalshi",     yes: kalshiYes, color: "#00B3A1", logo: <KalshiLogo size={13} /> },
  ];

  return (
    <div className="px-5 py-4 border-t border-[--border-subtle] bg-[--bg-subtle] space-y-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-widest text-[--text-muted] font-medium">Odds</span>
        <div className="flex items-center gap-3 text-[10px] text-[--text-muted]">
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-[#1652F0]/80" /> Polymarket</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-[#00B3A1]/80" /> Kalshi</span>
        </div>
      </div>
      {rows.map((row) => {
        if (row.yes == null) return null;
        const yesPct = row.yes * 100;
        const noPct  = (1 - row.yes) * 100;
        return (
          <div key={row.label} className="group/bar">
            <div className="flex items-center gap-2 mb-1">
              {row.logo}
              <span className="text-[11px] text-[--text-secondary]">{row.label}</span>
              <span className="ml-auto font-mono text-[12px] font-semibold" style={{ color: row.color }}>
                {pct(row.yes)} YES
              </span>
            </div>
            {/* Split bar — relative track, absolute fill so rounded corners are never clipped */}
            <div className="relative h-5 rounded-full bg-[--surface-hover] select-none group-hover/bar:bg-[--border] transition-colors">
              <div
                className={`binary-fill ${row.label === "Polymarket" ? "binary-fill-poly" : "binary-fill-kalshi"} absolute inset-y-0 left-0 rounded-full flex items-center justify-end pr-1.5`}
                style={{ width: `${yesPct}%`, minWidth: "10px", background: row.color + "CC" }}
              >
                {yesPct > 14 && <span className="binary-price text-white/90 text-[10px] font-medium">{pct(row.yes)}</span>}
              </div>
              {/* NO label pinned to right of bar */}
              {noPct > 14 && (
                <span
                  className="absolute inset-y-0 right-0 flex items-center pr-1.5 text-[10px] text-[--text-muted] font-medium"
                  style={{ left: `max(${yesPct}%, 10px)` }}
                >
                  {pct(1 - row.yes)} NO
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Multi-outcome odds chart (3+ outcomes, e.g. "Who wins?") ─────────────────
// Horizontal grouped bar per outcome; bars are on an absolute 0–100% scale.
// Leader bar fills the full container so you see relative differences clearly.
function MultiOddsChart({ outcomes }: { outcomes: MatchedMarket[] }) {
  const priced = outcomes
    .filter((o) => o.poly_yes_ask != null || o.kalshi_yes_ask != null)
    .sort((a, b) => ((b.poly_yes_ask ?? b.kalshi_yes_ask ?? 0) as number) - ((a.poly_yes_ask ?? a.kalshi_yes_ask ?? 0) as number))
    .slice(0, 8);

  if (!priced.length) return null;

  const leader = Math.max(...priced.map((o) =>
    Math.max(o.poly_yes_ask as number ?? 0, o.kalshi_yes_ask as number ?? 0)
  ));

  return (
    <div className="px-5 py-4 border-t border-[--border-subtle] bg-[--bg-subtle]">
      {/* Legend */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] uppercase tracking-widest text-[--text-muted] font-medium">
          Top outcomes by probability
        </span>
        <div className="flex items-center gap-3 text-[10px] text-[--text-muted]">
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-[#1652F0]/80" /> Polymarket</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-[#00B3A1]/80" /> Kalshi</span>
        </div>
      </div>

      <div className="space-y-3">
        {priced.map((o, i) => {
          const polyYes   = o.poly_yes_ask   as number | undefined;
          const kalshiYes = o.kalshi_yes_ask as number | undefined;
          const polyW     = polyYes   != null ? (polyYes   / leader) * 100 : 0;
          const kalshiW   = kalshiYes != null ? (kalshiYes / leader) * 100 : 0;

          return (
            <div key={i} className="grid grid-cols-[120px_1fr_56px] items-center gap-2 group/row rounded-lg px-1 py-0.5 -mx-1 hover:bg-[--surface] transition-colors cursor-default">
              <span className="chart-label text-[11px] text-[--text-secondary] truncate">{o.poly_label}</span>
              <div className="flex flex-col gap-0.5">
                {/* Polymarket bar — relative track so rounded-full fill is never clipped */}
                <div className="relative h-3 rounded-full bg-[--surface-hover] group-hover/row:bg-[--border] transition-colors">
                  {polyYes != null && (
                    <div
                      className="bar-fill bar-fill-poly absolute inset-y-0 left-0 rounded-full"
                      style={{ width: `${polyW}%`, minWidth: "8px", background: "#1652F0CC" }}
                    />
                  )}
                </div>
                {/* Kalshi bar */}
                <div className="relative h-3 rounded-full bg-[--surface-hover] group-hover/row:bg-[--border] transition-colors">
                  {kalshiYes != null && (
                    <div
                      className="bar-fill bar-fill-kalshi absolute inset-y-0 left-0 rounded-full"
                      style={{ width: `${kalshiW}%`, minWidth: "8px", background: "#00B3A1CC" }}
                    />
                  )}
                </div>
              </div>
              {/* Prices */}
              <div className="flex flex-col items-end gap-0.5">
                <span className="chart-price chart-price-poly text-[10px] font-mono text-[#1652F0] dark:text-[#5b8df8]">{pct(polyYes)}</span>
                <span className="chart-price chart-price-kalshi text-[10px] font-mono text-[--kalshi-teal]">{pct(kalshiYes)}</span>
              </div>
            </div>
          );
        })}
      </div>

      {outcomes.length > 8 && (
        <p className="text-[10px] text-[--text-muted] mt-3">
          Showing top 8 of {outcomes.length} outcomes by probability
        </p>
      )}
    </div>
  );
}

function OddsChart({ outcomes }: { outcomes: MatchedMarket[] }) {
  const hasPrices = outcomes.some((o) => o.poly_yes_ask != null || o.kalshi_yes_ask != null);
  if (!hasPrices) return null;
  if (outcomes.length <= 2) return <BinaryOddsChart outcomes={outcomes} />;
  return <MultiOddsChart outcomes={outcomes} />;
}

// ── Market card ───────────────────────────────────────────────────────────────
function MarketCard({
  group,
  expanded,
  onToggle,
}: {
  group: GroupedMarket;
  expanded: boolean;
  onToggle: () => void;
}) {
  const category = categoryFromEvent(group.poly_event);
  const catClass = CATEGORY_COLORS[category];
  const shown = group.outcomes.slice(0, expanded ? undefined : 5);

  return (
    <div className="market-card surface rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-[--border-subtle]">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${catClass}`}>{category}</span>
              <span className="text-[--text-muted] text-xs">{group.outcomes.length} outcome{group.outcomes.length !== 1 ? "s" : ""}</span>
            </div>
            <h3 className="text-[--text-primary] font-semibold text-base leading-snug">{group.poly_event}</h3>
            {group.kalshi_event !== group.poly_event && (
              <p className="text-[--text-muted] text-xs mt-1 truncate">Kalshi: {group.kalshi_event}</p>
            )}
          </div>

          {/* Platform links */}
          <div className="flex gap-2 shrink-0">
            {group.poly_url ? (
              <a href={group.poly_url} target="_blank" rel="noopener noreferrer" title="View on Polymarket" className="hover:opacity-70 transition-opacity">
                <PolymarketLogo size={22} />
              </a>
            ) : (
              <span className="opacity-25" title="No Polymarket link"><PolymarketLogo size={22} /></span>
            )}
            {group.kalshi_url ? (
              <a href={group.kalshi_url} target="_blank" rel="noopener noreferrer" title="View on Kalshi" className="hover:opacity-70 transition-opacity">
                <KalshiLogo size={22} />
              </a>
            ) : (
              <span className="opacity-25" title="No Kalshi link"><KalshiLogo size={22} /></span>
            )}
          </div>
        </div>
      </div>

      {/* Outcome table — only when many outcomes (chart already covers 1–2 outcome events) */}
      {group.outcomes.length > 2 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[--border-subtle]">
                <th className="text-left px-5 py-2.5 text-[--text-muted] font-medium text-xs w-full">Outcome</th>
                <th className="text-right px-4 py-2.5 text-xs whitespace-nowrap">
                  <span className="flex items-center justify-end gap-1 text-[--text-muted]">
                    <PolymarketLogo size={11} /> YES
                  </span>
                </th>
                <th className="text-right px-4 py-2.5 text-xs whitespace-nowrap">
                  <span className="flex items-center justify-end gap-1 text-[--text-muted]">
                    <KalshiLogo size={11} /> YES
                  </span>
                </th>
                <th className="text-right px-5 py-2.5 text-xs text-[--text-muted] hidden sm:table-cell whitespace-nowrap">Spread</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((o, i) => {
                const polyYes   = o.poly_yes_ask   as number | undefined;
                const kalshiYes = o.kalshi_yes_ask as number | undefined;
                const spread    = polyYes != null && kalshiYes != null
                  ? Math.abs(polyYes - kalshiYes) * 100
                  : null;
                const spreadColor =
                  spread == null  ? "text-[--text-muted]"
                  : spread >= 3   ? "text-[--arb-amber] font-semibold"
                  : spread >= 1   ? "text-emerald-500 dark:text-emerald-400"
                  : "text-[--text-muted]";

                return (
                  <tr key={i} className="border-b border-[--border-subtle] last:border-0 hover:bg-[--surface-hover] transition-colors">
                    <td className="px-5 py-2.5 text-[--text-secondary] text-sm">{o.poly_label}</td>

                    <td className="px-4 py-2.5 text-right">
                      <span className="text-[#1652F0] dark:text-[#5b8df8] font-mono text-xs font-medium">
                        {pct(polyYes)}
                      </span>
                    </td>

                    <td className="px-4 py-2.5 text-right">
                      <span className="text-[--kalshi-teal] font-mono text-xs font-medium">
                        {pct(kalshiYes)}
                      </span>
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
      )}

      {/* Odds visualization */}
      <OddsChart outcomes={group.outcomes} />

      {/* Footer */}
      <div className="px-5 py-3 flex items-center justify-between border-t border-[--border-subtle]">
        {group.outcomes.length > 5 ? (
          <button
            onClick={onToggle}
            className="btn-pill text-xs text-[--text-muted] hover:text-[--text-primary] flex items-center gap-1"
          >
            {expanded ? (
              <><ChevronUp className="w-3.5 h-3.5" /> Collapse</>
            ) : (
              <><ChevronDown className="w-3.5 h-3.5" /> {group.outcomes.length - 5} more outcomes</>
            )}
          </button>
        ) : <span />}
        <Link
          href={`/arbitrage?event=${encodeURIComponent(group.poly_event)}`}
          className="link-arrow text-xs text-[--arb-amber] flex items-center gap-1"
        >
          Check arbitrage <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function MarketsPage() {
  const [markets, setMarkets] = useState<GroupedMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetchMatchedMarkets().then((d) => { setMarkets(d); setLoading(false); });
  }, []);

  const filtered = useMemo(
    () =>
      markets.filter((m) => {
        const matchSearch =
          !search ||
          m.poly_event.toLowerCase().includes(search.toLowerCase()) ||
          m.kalshi_event.toLowerCase().includes(search.toLowerCase());
        return matchSearch && (category === "All" || categoryFromEvent(m.poly_event) === category);
      }),
    [markets, search, category]
  );

  const categories = ["All", "Politics", "Sports", "Economics", "Tech", "Other"];
  const totalOutcomes = markets.reduce((s, m) => s + m.outcomes.length, 0);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Header */}
      <div className="mb-10">
        <div className="flex items-center gap-2 text-xs text-[--text-muted] mb-5">
          <Link href="/" className="hover:text-[--text-primary] transition-colors">Home</Link>
          <span>/</span>
          <span>Compare Markets</span>
        </div>

        <div className="flex items-start gap-4 mb-4">
          <div className="flex items-center gap-2 mt-1">
            <PolymarketLogo size={32} />
            <span className="text-[--text-muted] text-sm font-light">vs</span>
            <KalshiLogo size={32} />
          </div>
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-[--text-primary] leading-tight">
              Polymarket vs Kalshi
            </h1>
            <p className="text-[--text-secondary] text-sm mt-1">Same events, side by side.</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-5 text-sm text-[--text-secondary]">
          <span><strong className="text-[--text-primary] font-semibold">{markets.length}</strong> matched events</span>
          <span><strong className="text-[--text-primary] font-semibold">{totalOutcomes}</strong> outcome pairs</span>
          <span className="flex items-center gap-1.5 text-[--kalshi-teal] text-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-[--kalshi-teal] live-dot" />
            Live snapshot
          </span>
        </div>
      </div>

      {/* Sticky filters */}
      <div className="sticky top-14 z-10 py-3 bg-[--bg]/90 backdrop-blur-xl -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 border-b border-[--border-subtle] mb-6">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[--text-muted]" />
            <input
              type="text"
              placeholder="Search events..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg bg-[--surface] border border-[--border] text-[--text-primary] text-sm placeholder-[--text-muted] focus:outline-none focus:border-[--text-muted] transition-colors"
            />
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Filter className="w-3.5 h-3.5 text-[--text-muted] shrink-0" />
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
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
        </div>
      </div>

      {!loading && (
        <p className="text-[--text-muted] text-xs mb-4">
          {filtered.length} of {markets.length} events
        </p>
      )}

      {loading ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="surface rounded-2xl h-44 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-24 text-[--text-muted]">
          <TrendingUp className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm">No events match your search.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((m) => (
            <MarketCard
              key={m.poly_event}
              group={m}
              expanded={!!expanded[m.poly_event]}
              onToggle={() =>
                setExpanded((prev) => ({ ...prev, [m.poly_event]: !prev[m.poly_event] }))
              }
            />
          ))}
        </div>
      )}

      {/* Direct platform links */}
      {!loading && filtered.length > 0 && (
        <div className="mt-10 flex flex-col sm:flex-row items-center gap-4 text-sm text-[--text-secondary]">
          <span className="text-[--text-muted] text-xs">Trade directly on:</span>
          <a
            href="https://polymarket.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 rounded-xl surface hover:bg-[--surface-hover] transition-colors"
          >
            <PolymarketLogo size={18} />
            <span className="text-[#1652F0] dark:text-[#5b8df8] font-medium">Polymarket</span>
            <ExternalLink className="w-3 h-3 text-[--text-muted]" />
          </a>
          <a
            href="https://kalshi.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 rounded-xl surface hover:bg-[--surface-hover] transition-colors"
          >
            <KalshiLogo size={18} />
            <span className="text-[--kalshi-teal] font-medium">Kalshi</span>
            <ExternalLink className="w-3 h-3 text-[--text-muted]" />
          </a>
        </div>
      )}
    </div>
  );
}
