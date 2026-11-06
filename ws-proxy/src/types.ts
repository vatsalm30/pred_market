// Top of book for one venue's market, as seen by this server.
export interface Quote {
  yes_ask: number | null;
  no_ask: number | null;
  yes_ask_size: number | null; // contracts available at yes_ask
  no_ask_size: number | null;
  exchange_ts: number | null;  // ms, from the venue's message
  recv_ts: number;             // ms, when this server received it
}

// A Kalshi market and a Polymarket market matched by the data pipeline as the same outcome.
export interface Pair {
  pair_id: string;
  kalshi_ticker: string;
  poly_market_id: string;
  poly_yes_token: string;
  poly_no_token: string;
  poly_event: string;
  kalshi_event: string;
  poly_label: string;
  kalshi_label: string;
  event_score: number;
  outcome_score: number;
  poly_end_date: string | null;
  kalshi_end_date: string | null;
  poly_url: string;
  kalshi_url: string;
}

export type Leg = "YES" | "NO";

// Buy kalshi_leg on Kalshi and poly_leg on Polymarket; one of them pays $1 at settlement.
export interface Arb {
  arb_id: string;
  pair_id: string;
  kalshi_leg: Leg;
  poly_leg: Leg;
  kalshi_ask: number;
  poly_ask: number;
  gross_cost: number;
  net_profit_pct: number;
  max_contracts: number | null;   // smallest size at the two asks
  max_profit_usd: number | null;  // max_contracts * (1 - gross_cost)
  kalshi_ts: number | null;
  poly_ts: number | null;
  opened_ts: number;
  updated_ts: number;
}

export const emptyQuote = (): Quote => ({
  yes_ask: null,
  no_ask: null,
  yes_ask_size: null,
  no_ask_size: null,
  exchange_ts: null,
  recv_ts: 0,
});
