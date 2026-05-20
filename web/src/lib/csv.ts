export interface MatchedMarket {
  poly_event: string;
  kalshi_event: string;
  event_score: number;
  poly_market_id: string;
  poly_label: string;
  kalshi_market_id: string;
  kalshi_label: string;
  outcome_score: number;
  poly_yes_ask?: number;
  poly_no_ask?: number;
  kalshi_yes_ask?: number;
  kalshi_no_ask?: number;
  poly_url?: string;
  kalshi_url?: string;
  poly_end_date?: string;
  kalshi_end_date?: string;
  event_icon?: string;
  poly_volume?: number;
  kalshi_volume?: number;
}

export interface ArbitrageOpportunity {
  timestamp: string;
  kalshi_market_id: string;
  poly_market_id: string;
  poly_event: string;
  kalshi_event: string;
  poly_label: string;
  kalshi_label: string;
  event_score: number;
  outcome_score: number;
  kalshi_leg: string;
  poly_leg: string;
  kalshi_ask: number;
  poly_ask: number;
  gross_cost: number;
  gross_spread: number;
  net_profit_pct: number;
  poly_url: string;
  kalshi_url: string;
  poly_end_date?: string;
  kalshi_end_date?: string;
  event_icon?: string;
  poly_volume?: number;
  kalshi_volume?: number;
}

export interface GroupedMarket {
  poly_event: string;
  kalshi_event: string;
  event_score: number;
  outcomes: MatchedMarket[];
  poly_url: string | null;
  kalshi_url: string | null;
  poly_end_date: string | null;
  kalshi_end_date: string | null;
  event_icon: string | null;
  poly_volume: number;
  kalshi_volume: number;
  total_volume: number;
}

export interface AllEvent {
  id: string;
  title: string;
  icon: string;
  platforms: ("polymarket" | "kalshi")[];
  poly_url: string | null;
  kalshi_url: string | null;
  volume: number;
  volume_24h: number;
  end_date: string;
  category: string;
  yes_price_poly: number | null;
  yes_price_kalshi: number | null;
  num_outcomes: number;
  is_matched: boolean;
  event_score: number | null;
  top_outcomes?: { label: string; price: number }[];
}

// Module-level cache: each URL is fetched at most once per browser session.
const _fetchCache = new Map<string, Promise<unknown>>();
function cachedFetch<T>(url: string): Promise<T> {
  if (!_fetchCache.has(url)) _fetchCache.set(url, fetch(url).then((r) => r.json()));
  return _fetchCache.get(url) as Promise<T>;
}

export async function fetchMatchedMarkets(): Promise<GroupedMarket[]> {
  const [rawRows, arb] = await Promise.all([
    cachedFetch<Record<string, unknown>[]>("/data/matched_markets.json"),
    cachedFetch<ArbitrageOpportunity[]>("/data/arbitrage_opportunities.json"),
  ]);

  // Coerce numeric fields that the pipeline may have left as strings
  const numericFields = ["event_score", "outcome_score", "poly_yes_ask", "poly_no_ask", "kalshi_yes_ask", "kalshi_no_ask"] as const;
  const rows: MatchedMarket[] = rawRows.map((raw) => {
    const row = { ...raw } as Record<string, unknown>;
    for (const f of numericFields) {
      if (row[f] !== undefined && row[f] !== "" && row[f] !== null) {
        const n = Number(row[f]);
        if (!isNaN(n)) row[f] = n;
      } else {
        row[f] = undefined;
      }
    }
    return row as unknown as MatchedMarket;
  });

  // Fallback URL map from arbitrage data (for events missing row-level URLs)
  const arbUrlMap: Record<string, { poly_url: string; kalshi_url: string }> = {};
  for (const o of arb) {
    if (o.poly_event && !arbUrlMap[o.poly_event]) {
      arbUrlMap[o.poly_event] = { poly_url: o.poly_url, kalshi_url: o.kalshi_url };
    }
  }

  const grouped: Record<string, GroupedMarket> = {};
  for (const row of rows) {
    const key = row.poly_event;
    if (!grouped[key]) {
      // Prefer URLs from the row itself; fall back to arb data
      const polyUrl = row.poly_url || arbUrlMap[key]?.poly_url || null;
      const kalshiUrl = row.kalshi_url || arbUrlMap[key]?.kalshi_url || null;
      grouped[key] = {
        poly_event: row.poly_event,
        kalshi_event: row.kalshi_event,
        event_score: row.event_score,
        outcomes: [],
        poly_url: polyUrl,
        kalshi_url: kalshiUrl,
        poly_end_date: row.poly_end_date || null,
        kalshi_end_date: row.kalshi_end_date || null,
        event_icon: row.event_icon || null,
        poly_volume:    (row.poly_volume    as number) || 0,
        kalshi_volume:  (row.kalshi_volume  as number) || 0,
        total_volume:   ((row.poly_volume as number) || 0) + ((row.kalshi_volume as number) || 0),
      };
    }
    // Ensure each outcome also has its own URL (for per-outcome deep links)
    if (!row.poly_url && arbUrlMap[key]?.poly_url) row.poly_url = arbUrlMap[key].poly_url;
    if (!row.kalshi_url && arbUrlMap[key]?.kalshi_url) row.kalshi_url = arbUrlMap[key].kalshi_url;
    grouped[key].outcomes.push(row);
  }
  return Object.values(grouped).sort((a, b) =>
    b.total_volume !== a.total_volume ? b.total_volume - a.total_volume : b.event_score - a.event_score
  );
}

export async function fetchArbitrageOpportunities(): Promise<ArbitrageOpportunity[]> {
  return cachedFetch("/data/arbitrage_opportunities.json");
}

export function formatPct(val: number): string {
  return (val * 100).toFixed(1) + "%";
}

export function formatScore(val: number): string {
  return Math.round(val * 100) + "%";
}

export async function fetchAllEvents(): Promise<AllEvent[]> {
  return cachedFetch("/data/all_events.json");
}

export function formatVolume(vol: number): string {
  if (!vol) return "—";
  if (vol >= 1_000_000) return `$${(vol / 1_000_000).toFixed(1)}M`;
  if (vol >= 1_000) return `$${(vol / 1_000).toFixed(0)}K`;
  return `$${vol.toFixed(0)}`;
}

export function categoryFromEvent(event: string): string {
  const lower = event.toLowerCase();
  if (/election|president|senate|congress|governor|prime minister|mayoral|ballot|vote|poll/.test(lower)) return "Politics";
  if (/fifa|world cup|nba|nfl|pga|tennis|open|soccer|basketball|baseball|hockey|sport|golf|tournament|champion/.test(lower)) return "Sports";
  if (/bitcoin|crypto|eth|fed|rate|gdp|economy|inflation|recession|market|stock|dollar/.test(lower)) return "Economics";
  if (/ai|tech|apple|elon|musk|openai|spacex|tesla/.test(lower)) return "Tech";
  return "Other";
}
