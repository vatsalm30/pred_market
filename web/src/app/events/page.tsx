"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import Link from "next/link";
import {
  Search, Filter, TrendingUp, Calendar, ArrowRight,
  ChevronDown, ChevronUp, AlertTriangle, LayoutGrid, Rows3,
} from "lucide-react";
import {
  fetchAllEvents, fetchMatchedMarkets,
  type AllEvent, type GroupedMarket,
  formatVolume, categoryFromEvent,
} from "@/lib/csv";
import { PolymarketLogo, KalshiLogo } from "@/components/PlatformLogos";
import EventIcon from "@/components/EventIcon";
import { OddsChart } from "@/components/OddsChart";

const CATEGORY_COLORS: Record<string, string> = {
  Politics:  "text-blue-500  dark:text-blue-400  bg-blue-500/8   border-blue-500/20",
  Sports:    "text-emerald-600 dark:text-emerald-400 bg-emerald-500/8 border-emerald-500/20",
  Economics: "text-amber-600  dark:text-amber-400  bg-amber-500/8  border-amber-500/20",
  Tech:      "text-violet-600 dark:text-violet-400 bg-violet-500/8 border-violet-500/20",
  Other:     "text-[--text-muted] bg-[--bg-subtle] border-[--border]",
};

function fmtDate(d?: string | null): string {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00Z");
  if (isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function dateDiffDays(a?: string | null, b?: string | null): number | null {
  if (!a || !b) return null;
  const da = new Date(a + "T00:00:00Z").getTime();
  const db = new Date(b + "T00:00:00Z").getTime();
  if (isNaN(da) || isNaN(db)) return null;
  return Math.abs(da - db) / (1000 * 60 * 60 * 24);
}

function pct(v: number | undefined): string {
  if (v == null) return "—";
  return (v * 100).toFixed(v < 0.1 ? 1 : 0) + "%";
}

// ── Single-platform bar (unmatched events) ────────────────────────────────────
function SinglePlatformBar({
  yesPrice,
  platform,
}: {
  yesPrice: number | null;
  platform: "polymarket" | "kalshi";
}) {
  if (yesPrice == null) return null;
  const color = platform === "polymarket" ? "#1652F0" : "#00B3A1";
  const Logo  = platform === "polymarket" ? PolymarketLogo : KalshiLogo;
  const label = platform === "polymarket" ? "Polymarket" : "Kalshi";
  const yesPct = yesPrice * 100;
  return (
    <div className="px-4 py-4 border-t border-[--border-subtle] bg-[--bg-subtle]">
      <div className="flex items-center gap-2 mb-1.5">
        <Logo size={12} />
        <span className="text-[11px] text-[--text-secondary]">{label}</span>
        <span className="ml-auto font-mono text-xs font-semibold" style={{ color }}>
          {yesPct.toFixed(1)}% YES
        </span>
      </div>
      <div className="relative h-4 rounded-full bg-[--surface-hover]">
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${yesPct}%`, minWidth: "8px", background: color + "CC" }}
        />
        {(100 - yesPct) > 14 && (
          <span className="absolute inset-y-0 right-0 flex items-center pr-1.5 text-[10px] text-[--text-muted]">
            {(100 - yesPct).toFixed(1)}% NO
          </span>
        )}
      </div>
    </div>
  );
}

// ── All-markets card ──────────────────────────────────────────────────────────
function EventCard({ event, matched }: { event: AllEvent; matched: GroupedMarket | null }) {
  const catClass = CATEGORY_COLORS[event.category] || CATEGORY_COLORS.Other;
  const hasPoly   = event.platforms.includes("polymarket");
  const hasKalshi = event.platforms.includes("kalshi");

  return (
    <div className="market-card surface rounded-2xl overflow-hidden flex flex-col">
      <div className="px-4 py-3.5 border-b border-[--border-subtle]">
        <div className="flex items-start gap-3">
          <EventIcon src={event.icon || null} alt={event.title} size={40} className="shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
              <span className={`text-[10px] font-medium px-1.5 py-px rounded-full border ${catClass}`}>
                {event.category}
              </span>
              <div className="flex items-center gap-1 ml-auto shrink-0">
                <span className={hasPoly   ? "" : "opacity-20"} title={hasPoly   ? "On Polymarket" : "Not on Polymarket"}>
                  <PolymarketLogo size={13} />
                </span>
                <span className={hasKalshi ? "" : "opacity-20"} title={hasKalshi ? "On Kalshi" : "Not on Kalshi"}>
                  <KalshiLogo size={13} />
                </span>
              </div>
            </div>
            <h3 className="text-[--text-primary] text-sm font-semibold leading-snug line-clamp-2">
              {event.title}
            </h3>
            {event.num_outcomes > 1 && (
              <p className="text-[10px] text-[--text-muted] mt-0.5">{event.num_outcomes} outcomes</p>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1">
        {matched ? (
          <OddsChart outcomes={matched.outcomes} maxOutcomes={4} />
        ) : (
          <SinglePlatformBar
            yesPrice={hasPoly ? event.yes_price_poly : event.yes_price_kalshi}
            platform={hasPoly ? "polymarket" : "kalshi"}
          />
        )}
      </div>

      <div className="px-4 py-2.5 flex items-center justify-between border-t border-[--border-subtle] bg-[--bg-subtle]">
        <div className="flex items-center gap-2 text-[10px] text-[--text-muted] flex-wrap">
          {event.volume > 0 && (
            <span className="font-medium text-[--text-secondary]">{formatVolume(event.volume)}</span>
          )}
          {event.volume_24h > 0 && (
            <span className="text-[--text-muted]">{formatVolume(event.volume_24h)}/24h</span>
          )}
          {event.end_date && (
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {fmtDate(event.end_date)}
            </span>
          )}
        </div>
        <Link
          href={`/events/${encodeURIComponent(event.id)}`}
          className="link-arrow text-[10px] text-[--text-secondary] hover:text-[--arb-amber] flex items-center gap-0.5 transition-colors shrink-0"
        >
          Details <ArrowRight className="w-2.5 h-2.5" />
        </Link>
      </div>
    </div>
  );
}

// ── Compare card (matched markets) ────────────────────────────────────────────
function CompareCard({
  group,
  event,
  expanded,
  onToggle,
}: {
  group: GroupedMarket;
  event: AllEvent | null;
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
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <EventIcon src={group.event_icon} alt={group.poly_event} size={44} className="mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className={`text-[10px] font-medium px-1.5 py-px rounded-full border ${catClass}`}>{category}</span>
                <span className="text-[--text-muted] text-[10px]">{group.outcomes.length} outcome{group.outcomes.length !== 1 ? "s" : ""}</span>
              </div>
              <h3 className="text-[--text-primary] font-semibold text-sm leading-snug">{group.poly_event}</h3>
              {group.kalshi_event !== group.poly_event && (
                <p className="text-[--text-muted] text-xs mt-0.5 truncate">Kalshi: {group.kalshi_event}</p>
              )}
              {(group.poly_end_date || group.kalshi_end_date) && (() => {
                const diff = dateDiffDays(group.poly_end_date, group.kalshi_end_date);
                const mismatch = diff !== null && diff > 30;
                return (
                  <div className="flex items-center gap-3 mt-1 text-[10px] text-[--text-muted]">
                    <span className="flex items-center gap-1">
                      <span className="text-[#1652F0] dark:text-[#5b8df8]">Poly</span>
                      <span className="font-mono">{fmtDate(group.poly_end_date)}</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="text-[--kalshi-teal]">Kalshi</span>
                      <span className="font-mono">{fmtDate(group.kalshi_end_date)}</span>
                    </span>
                    {mismatch && (
                      <span className="flex items-center gap-0.5 text-amber-500 font-medium">
                        <AlertTriangle className="w-2.5 h-2.5" /> {Math.round(diff!)}d apart
                      </span>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            {group.poly_url ? (
              <a href={group.poly_url} target="_blank" rel="noopener noreferrer" className="hover:opacity-70 transition-opacity">
                <PolymarketLogo size={20} />
              </a>
            ) : (
              <span className="opacity-25"><PolymarketLogo size={20} /></span>
            )}
            {group.kalshi_url ? (
              <a href={group.kalshi_url} target="_blank" rel="noopener noreferrer" className="hover:opacity-70 transition-opacity">
                <KalshiLogo size={20} />
              </a>
            ) : (
              <span className="opacity-25"><KalshiLogo size={20} /></span>
            )}
          </div>
        </div>
      </div>

      {/* Outcome table for multi-outcome events */}
      {group.outcomes.length > 2 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[--border-subtle]">
                <th className="text-left px-5 py-2.5 text-[--text-muted] font-medium text-xs w-full">Outcome</th>
                <th className="text-right px-4 py-2.5 text-xs whitespace-nowrap">
                  <span className="flex items-center justify-end gap-1 text-[--text-muted]"><PolymarketLogo size={11} /> YES</span>
                </th>
                <th className="text-right px-4 py-2.5 text-xs whitespace-nowrap">
                  <span className="flex items-center justify-end gap-1 text-[--text-muted]"><KalshiLogo size={11} /> YES</span>
                </th>
                <th className="text-right px-5 py-2.5 text-xs text-[--text-muted] hidden sm:table-cell whitespace-nowrap">Spread</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((o, i) => {
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
      )}

      {/* Odds chart */}
      <OddsChart outcomes={group.outcomes} />

      {/* Footer */}
      <div className="px-4 py-2.5 flex items-center justify-between border-t border-[--border-subtle] bg-[--bg-subtle]">
        <div className="flex items-center gap-3 text-[10px] text-[--text-muted]">
          {group.total_volume > 0 && (
            <span className="font-medium text-[--text-secondary]">{formatVolume(group.total_volume)}</span>
          )}
          {event && event.volume_24h > 0 && (
            <span>{formatVolume(event.volume_24h)}/24h</span>
          )}
          {group.outcomes.length > 5 && (
            <button
              onClick={onToggle}
              className="flex items-center gap-0.5 hover:text-[--text-primary] transition-colors"
            >
              {expanded
                ? <><ChevronUp className="w-3 h-3" /> Less</>
                : <><ChevronDown className="w-3 h-3" /> {group.outcomes.length - 5} more</>}
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          {event && (
            <Link
              href={`/events/${encodeURIComponent(event.id)}`}
              className="link-arrow text-[10px] text-[--text-secondary] hover:text-[--text-primary] flex items-center gap-0.5 transition-colors"
            >
              Details <ArrowRight className="w-2.5 h-2.5" />
            </Link>
          )}
          <Link
            href={`/arbitrage?event=${encodeURIComponent(group.poly_event)}`}
            className="link-arrow text-[10px] text-[--arb-amber] flex items-center gap-0.5"
          >
            Arb <ArrowRight className="w-2.5 h-2.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}

type PlatformFilter = "all" | "polymarket" | "kalshi" | "both";
type SortKey = "volume" | "volume_24h" | "date" | "probability";
type ViewMode = "all" | "compare";

const PAGE_SIZE = 24;

export default function AllEventsPage() {
  const [events, setEvents]         = useState<AllEvent[]>([]);
  const [matchedMap, setMatchedMap] = useState<Map<string, GroupedMarket>>(new Map());
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState("");
  const [category, setCategory]     = useState("All");
  const [platform, setPlatform]     = useState<PlatformFilter>("all");
  const [sortBy, setSortBy]         = useState<SortKey>("volume");
  const [view, setView]             = useState<ViewMode>("all");
  const [page, setPage]             = useState(1);
  const [expanded, setExpanded]     = useState<Record<string, boolean>>({});
  const sentinelRef                 = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([fetchAllEvents(), fetchMatchedMarkets()]).then(([allEvts, matched]) => {
      setEvents(allEvts);
      setMatchedMap(new Map(matched.map((g) => [g.poly_event, g])));
      setLoading(false);
    });
  }, []);

  useEffect(() => { setPage(1); }, [search, category, platform, sortBy, view]);

  // "All" mode
  const filtered = useMemo(() => {
    const list = events.filter((e) => {
      if (search && !e.title.toLowerCase().includes(search.toLowerCase())) return false;
      if (category !== "All" && e.category !== category) return false;
      if (platform === "polymarket" && !e.platforms.includes("polymarket")) return false;
      if (platform === "kalshi"     && !e.platforms.includes("kalshi"))     return false;
      if (platform === "both"       && e.platforms.length < 2)              return false;
      return true;
    });
    return [...list].sort((a, b) => {
      if (sortBy === "volume")     return b.volume - a.volume;
      if (sortBy === "volume_24h") return b.volume_24h - a.volume_24h;
      if (sortBy === "date") {
        const da = a.end_date || "9999-12-31";
        const db = b.end_date || "9999-12-31";
        return da < db ? -1 : da > db ? 1 : 0;
      }
      const pa = a.yes_price_poly ?? a.yes_price_kalshi ?? 0;
      const pb = b.yes_price_poly ?? b.yes_price_kalshi ?? 0;
      return pb - pa;
    });
  }, [events, search, category, platform, sortBy]);

  // "Compare" mode — keyed on GroupedMarket, joined with AllEvent for 24h vol
  const eventTitleMap = useMemo(() => new Map(events.map((e) => [e.title, e])), [events]);
  const compareList = useMemo(() => {
    const groups = Array.from(matchedMap.values()).filter((g) => {
      if (search && !g.poly_event.toLowerCase().includes(search.toLowerCase()) && !g.kalshi_event.toLowerCase().includes(search.toLowerCase())) return false;
      if (category !== "All" && categoryFromEvent(g.poly_event) !== category) return false;
      return true;
    });
    return [...groups].sort((a, b) => {
      if (sortBy === "volume")     return b.total_volume - a.total_volume;
      if (sortBy === "volume_24h") return (eventTitleMap.get(b.poly_event)?.volume_24h ?? 0) - (eventTitleMap.get(a.poly_event)?.volume_24h ?? 0);
      if (sortBy === "date") {
        const da = a.poly_end_date || "9999-12-31";
        const db = b.poly_end_date || "9999-12-31";
        return da < db ? -1 : da > db ? 1 : 0;
      }
      return b.event_score - a.event_score;
    });
  }, [matchedMap, search, category, sortBy, eventTitleMap]);

  const activeList  = view === "all" ? filtered : compareList;
  const hasMore     = page * PAGE_SIZE < activeList.length;

  const loadMore = useCallback(() => { if (hasMore) setPage((p) => p + 1); }, [hasMore]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) loadMore(); }, { rootMargin: "200px" });
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadMore]);

  const categories = ["All", "Politics", "Sports", "Economics", "Tech", "Other"];
  const totalVol   = events.reduce((s, e) => s + e.volume, 0);
  const totalVol24h = events.reduce((s, e) => s + (e.volume_24h || 0), 0);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 text-xs text-[--text-muted] mb-5">
          <Link href="/" className="hover:text-[--text-primary] transition-colors">Home</Link>
          <span>/</span>
          <span>All Markets</span>
        </div>

        <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-[--text-primary] leading-tight mb-2">
              All Markets
            </h1>
            <p className="text-[--text-secondary] text-sm">
              Every active prediction market on Polymarket and Kalshi.
            </p>
          </div>
          {/* View toggle */}
          <div className="flex items-center gap-1 p-1 bg-[--surface] rounded-xl border border-[--border] shrink-0 self-start">
            <button
              onClick={() => setView("all")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                view === "all"
                  ? "bg-[--bg] text-[--text-primary] shadow-sm border border-[--border-subtle]"
                  : "text-[--text-muted] hover:text-[--text-primary]"
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" /> All
            </button>
            <button
              onClick={() => setView("compare")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                view === "compare"
                  ? "bg-[--bg] text-[--text-primary] shadow-sm border border-[--border-subtle]"
                  : "text-[--text-muted] hover:text-[--text-primary]"
              }`}
            >
              <Rows3 className="w-3.5 h-3.5" /> Compare
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-5 text-sm text-[--text-secondary]">
          <span><strong className="text-[--text-primary] font-semibold">{loading ? "—" : events.length.toLocaleString()}</strong> markets</span>
          <span><strong className="text-[--text-primary] font-semibold">{loading ? "—" : formatVolume(totalVol)}</strong> total vol</span>
          <span><strong className="text-[--text-primary] font-semibold">{loading ? "—" : formatVolume(totalVol24h)}</strong> 24h vol</span>
          <span><strong className="text-[--text-primary] font-semibold">{loading ? "—" : events.filter((e) => e.is_matched).length}</strong> cross-platform</span>
          <span className="flex items-center gap-1.5 text-[--kalshi-teal] text-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-[--kalshi-teal] live-dot" />
            Live snapshot
          </span>
        </div>
      </div>

      {/* Sticky filters */}
      <div className="sticky top-14 z-10 py-3 bg-[--bg]/90 backdrop-blur-xl -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 border-b border-[--border-subtle] mb-6 space-y-2.5">
        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[--text-muted]" />
            <input
              type="text"
              placeholder="Search markets..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg bg-[--surface] border border-[--border] text-[--text-primary] text-sm placeholder-[--text-muted] focus:outline-none focus:border-[--text-muted] transition-colors"
            />
          </div>
          {view === "all" && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {(["all", "polymarket", "kalshi", "both"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPlatform(p)}
                  className={`btn-pill flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium ${
                    platform === p
                      ? "bg-[--surface] text-[--text-primary] border border-[--border]"
                      : "text-[--text-muted] hover:text-[--text-primary]"
                  }`}
                >
                  {p === "polymarket" && <PolymarketLogo size={11} />}
                  {p === "kalshi"     && <KalshiLogo size={11} />}
                  {p === "both"       && <><PolymarketLogo size={11} /><KalshiLogo size={11} /></>}
                  {p === "all" ? "All" : p === "both" ? "Both" : p === "polymarket" ? "Polymarket" : "Kalshi"}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap">
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
          <div className="flex items-center gap-1.5">
            <span className="text-[--text-muted] text-xs">Sort:</span>
            {(["volume", "volume_24h", "date", "probability"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSortBy(s)}
                className={`btn-pill px-2.5 py-1.5 rounded-lg text-xs font-medium ${
                  sortBy === s
                    ? "bg-[--surface] text-[--text-primary] border border-[--border]"
                    : "text-[--text-muted] hover:text-[--text-primary]"
                }`}
              >
                {s === "volume" ? "Total Vol" : s === "volume_24h" ? "24h Vol" : s === "date" ? "Date" : "Prob"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!loading && (
        <p className="text-[--text-muted] text-xs mb-5">
          {Math.min(page * PAGE_SIZE, activeList.length)} of {activeList.length.toLocaleString()}{" "}
          {view === "compare" ? "matched events" : "markets"}
        </p>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(12)].map((_, i) => (
            <div key={i} className="surface rounded-2xl h-52 animate-pulse" style={{ opacity: 1 - i * 0.06 }} />
          ))}
        </div>
      ) : activeList.length === 0 ? (
        <div className="text-center py-24 text-[--text-muted]">
          <TrendingUp className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm">No markets match your search.</p>
        </div>
      ) : view === "all" ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.slice(0, page * PAGE_SIZE).map((event) => (
              <EventCard
                key={event.id}
                event={event}
                matched={matchedMap.get(event.title) ?? null}
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
                Load more ({activeList.length - page * PAGE_SIZE} remaining)
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {compareList.slice(0, page * PAGE_SIZE).map((group) => (
              <CompareCard
                key={group.poly_event}
                group={group}
                event={eventTitleMap.get(group.poly_event) ?? null}
                expanded={!!expanded[group.poly_event]}
                onToggle={() => setExpanded((prev) => ({ ...prev, [group.poly_event]: !prev[group.poly_event] }))}
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
                Load more ({activeList.length - page * PAGE_SIZE} remaining)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
