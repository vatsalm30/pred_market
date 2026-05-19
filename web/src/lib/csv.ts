export interface MatchedMarket {
  poly_event: string;
  kalshi_event: string;
  event_score: number;
  poly_market_id: string;
  poly_label: string;
  kalshi_market_id: string;
  kalshi_label: string;
  outcome_score: number;
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
}

export interface GroupedMarket {
  poly_event: string;
  kalshi_event: string;
  event_score: number;
  outcomes: MatchedMarket[];
  poly_url: string | null;
  kalshi_url: string | null;
}

export async function fetchMatchedMarkets(): Promise<GroupedMarket[]> {
  const [rows, arb]: [MatchedMarket[], ArbitrageOpportunity[]] = await Promise.all([
    fetch("/data/matched_markets.json").then((r) => r.json()),
    fetch("/data/arbitrage_opportunities.json").then((r) => r.json()),
  ]);

  const urlMap: Record<string, { poly_url: string; kalshi_url: string }> = {};
  for (const o of arb) {
    if (o.poly_event && !urlMap[o.poly_event]) {
      urlMap[o.poly_event] = { poly_url: o.poly_url, kalshi_url: o.kalshi_url };
    }
  }

  const grouped: Record<string, GroupedMarket> = {};
  for (const row of rows) {
    const key = row.poly_event;
    if (!grouped[key]) {
      grouped[key] = {
        poly_event: row.poly_event,
        kalshi_event: row.kalshi_event,
        event_score: row.event_score,
        outcomes: [],
        poly_url: urlMap[key]?.poly_url ?? null,
        kalshi_url: urlMap[key]?.kalshi_url ?? null,
      };
    }
    grouped[key].outcomes.push(row);
  }
  return Object.values(grouped).sort((a, b) => b.event_score - a.event_score);
}

export async function fetchArbitrageOpportunities(): Promise<ArbitrageOpportunity[]> {
  return fetch("/data/arbitrage_opportunities.json").then((r) => r.json());
}

export function formatPct(val: number): string {
  return (val * 100).toFixed(1) + "%";
}

export function formatScore(val: number): string {
  return Math.round(val * 100) + "%";
}

export function categoryFromEvent(event: string): string {
  const lower = event.toLowerCase();
  if (/election|president|senate|congress|governor|prime minister|mayoral|ballot|vote|poll/.test(lower)) return "Politics";
  if (/fifa|world cup|nba|nfl|pga|tennis|open|soccer|basketball|baseball|hockey|sport|golf|tournament|champion/.test(lower)) return "Sports";
  if (/bitcoin|crypto|eth|fed|rate|gdp|economy|inflation|recession|market|stock|dollar/.test(lower)) return "Economics";
  if (/ai|tech|apple|elon|musk|openai|spacex|tesla/.test(lower)) return "Tech";
  return "Other";
}
