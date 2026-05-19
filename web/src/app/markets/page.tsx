"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Search, TrendingUp, Filter, ChevronDown, ChevronUp, ArrowRight, ExternalLink } from "lucide-react";
import { fetchMatchedMarkets, type GroupedMarket, categoryFromEvent } from "@/lib/csv";
import { PolymarketLogo, KalshiLogo } from "@/components/PlatformLogos";

const CATEGORY_COLORS: Record<string, string> = {
  Politics:  "text-blue-500  dark:text-blue-400  bg-blue-500/8   border-blue-500/20",
  Sports:    "text-emerald-600 dark:text-emerald-400 bg-emerald-500/8 border-emerald-500/20",
  Economics: "text-amber-600  dark:text-amber-400  bg-amber-500/8  border-amber-500/20",
  Tech:      "text-violet-600 dark:text-violet-400 bg-violet-500/8 border-violet-500/20",
  Other:     "text-[--text-muted] bg-[--bg-subtle] border-[--border]",
};

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
    <div className="surface rounded-2xl overflow-hidden hover:bg-[--surface-hover] transition-colors">
      <div className="px-5 py-4 border-b border-[--border-subtle]">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${catClass}`}>{category}</span>
              <span className="text-[--text-muted] text-xs">{group.outcomes.length} outcomes</span>
            </div>
            <h3 className="text-[--text-primary] font-semibold text-base leading-snug">{group.poly_event}</h3>
            <p className="text-[--text-muted] text-xs mt-1 truncate">{group.kalshi_event}</p>
          </div>
          <div className="flex gap-2 shrink-0">
            {group.poly_url ? (
              <a
                href={group.poly_url}
                target="_blank"
                rel="noopener noreferrer"
                title="View on Polymarket"
                className="hover:opacity-70 transition-opacity"
              >
                <PolymarketLogo size={22} />
              </a>
            ) : (
              <PolymarketLogo size={22} />
            )}
            {group.kalshi_url ? (
              <a
                href={group.kalshi_url}
                target="_blank"
                rel="noopener noreferrer"
                title="View on Kalshi"
                className="hover:opacity-70 transition-opacity"
              >
                <KalshiLogo size={22} />
              </a>
            ) : (
              <KalshiLogo size={22} />
            )}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[--border-subtle]">
              <th className="text-left px-5 py-2.5 text-[--text-muted] font-medium text-xs">Outcome</th>
              <th className="text-center px-4 py-2.5 text-xs">
                <span className="flex items-center justify-center gap-1 text-[--text-muted]">
                  <PolymarketLogo size={12} /> Polymarket
                </span>
              </th>
              <th className="text-center px-4 py-2.5 text-xs">
                <span className="flex items-center justify-center gap-1 text-[--text-muted]">
                  <KalshiLogo size={12} /> Kalshi
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((o, i) => (
              <tr
                key={i}
                className="border-b border-[--border-subtle] last:border-0 hover:bg-[--surface-hover] transition-colors"
              >
                <td className="px-5 py-3 text-[--text-secondary]">{o.poly_label}</td>
                <td className="px-4 py-3 text-center">
                  <span className="text-[#1652F0] dark:text-[#5b8df8] font-mono text-xs bg-blue-500/5 px-2 py-0.5 rounded">
                    {o.poly_label}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className="text-[--kalshi-teal] font-mono text-xs bg-teal-500/5 px-2 py-0.5 rounded">
                    {o.kalshi_label}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="px-5 py-3 flex items-center justify-between border-t border-[--border-subtle]">
        {group.outcomes.length > 5 ? (
          <button
            onClick={onToggle}
            className="text-xs text-[--text-muted] hover:text-[--text-primary] transition-colors flex items-center gap-1"
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
          className="text-xs text-[--arb-amber] hover:opacity-70 transition-opacity flex items-center gap-1"
        >
          Check arbitrage <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
}

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
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
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
