"""Arbitrage opportunity detection and calculation."""
from dataclasses import dataclass, fields
from datetime import datetime, timezone
from typing import List, Dict
import pmxt
from config import KALSHI_WIN_FEE, POLYMARKET_WIN_FEE, MIN_PROFIT_PCT, KALSHI_API_KEY
import pandas as pd

MIN_OUTCOME_SCORE = 0.80


@dataclass
class Opportunity:
    timestamp: str
    kalshi_market_id: str
    poly_market_id: str

    poly_event: str
    kalshi_event: str
    poly_label: str
    kalshi_label: str
    event_score: float
    outcome_score: float

    kalshi_leg: str
    poly_leg: str
    kalshi_ask: float
    poly_ask: float

    gross_cost: float
    gross_spread: float
    net_profit_pct: float

    # URLs for quick access
    poly_url: str
    kalshi_url: str

    @property
    def direction(self) -> str:
        return f"K_{self.kalshi_leg} + P_{self.poly_leg}"

    @property
    def is_strong(self) -> bool:
        return self.net_profit_pct >= 3.0


def build_kalshi_url(market_id: str) -> str:
    # Kalshi market IDs look like KXPRESPERSON-28-GNEWS
    # URL format: https://kalshi.com/markets/kxpresperson-28/kxpresperson-28-gnews
    # The event slug is everything up to the last hyphen-separated segment
    parts = market_id.split("-")
    if len(parts) >= 2:
        # Event slug = all parts except the last option code
        event_slug = "-".join(parts[:-1]).lower()
        option_slug = market_id.lower()
        return f"https://kalshi.com/markets/{event_slug}/{option_slug}"
    return f"https://kalshi.com/markets/{market_id.lower()}"


def find_arbitrage_opportunities(matches: List[Dict]) -> List[Opportunity]:
    poly_ex   = pmxt.Exchange("POLYMARKET")
    kalshi_ex = pmxt.Exchange("KALSHI", api_key=KALSHI_API_KEY)
    opportunities: List[Opportunity] = []

    poly_markets   = {str(m.market_id): m for m in poly_ex.fetch_markets()}
    kalshi_markets = {str(m.market_id): m for m in kalshi_ex.fetch_markets()}

    def net_payout(ask: float, fee_rate: float) -> float:
        return 1.0 - fee_rate * (1.0 - ask)

    for m in matches:
        if float(m.get("outcome_score", 0)) < MIN_OUTCOME_SCORE:
            continue

        poly_id   = str(m["poly_market_id"])
        kalshi_id = str(m["kalshi_market_id"])

        poly_market   = poly_markets.get(poly_id)
        kalshi_market = kalshi_markets.get(kalshi_id)

        if poly_market is None or kalshi_market is None:
            print(f"  Missing market: poly={poly_id}, kalshi={kalshi_id}")
            continue

        poly_yes   = poly_market.yes.price   if poly_market.yes   else None
        poly_no    = poly_market.no.price    if poly_market.no    else None
        kalshi_yes = kalshi_market.yes.price if kalshi_market.yes else None
        kalshi_no  = kalshi_market.no.price  if kalshi_market.no  else None

        if None in (poly_yes, poly_no, kalshi_yes, kalshi_no):
            continue

        # Pull URLs — Polymarket exposes .url directly, Kalshi we construct
        poly_url   = getattr(poly_market,   "url",  None) or f"https://polymarket.com/event/{poly_market.slug}"
        kalshi_url = getattr(kalshi_market, "url",  None) or build_kalshi_url(kalshi_id)

        for kalshi_leg, poly_leg, kalshi_ask, poly_ask in [
            ("YES", "NO",  kalshi_yes, poly_no),
            ("NO",  "YES", kalshi_no,  poly_yes),
        ]:
            if not (0 < kalshi_ask < 1 and 0 < poly_ask < 1):
                continue

            gross_cost = kalshi_ask + poly_ask

            profit_if_kalshi_wins = net_payout(kalshi_ask, KALSHI_WIN_FEE)  - poly_ask
            profit_if_poly_wins   = net_payout(poly_ask,   POLYMARKET_WIN_FEE) - kalshi_ask

            # guaranteed_profit = min(profit_if_kalshi_wins, profit_if_poly_wins)
            gross_spread      = 1.0 - gross_cost
            net_profit_pct    = (1 - gross_cost) * 100 / gross_cost if gross_cost > 0 else 0

            if net_profit_pct < MIN_PROFIT_PCT:
                continue

            opportunities.append(
                Opportunity(
                    timestamp        = datetime.now(timezone.utc).isoformat(),
                    kalshi_market_id = kalshi_id,
                    poly_market_id   = poly_id,
                    poly_event       = str(m.get("poly_event",    "")),
                    kalshi_event     = str(m.get("kalshi_event",  "")),
                    poly_label       = str(m.get("poly_label",    "")),
                    kalshi_label     = str(m.get("kalshi_label",  "")),
                    event_score      = float(m.get("event_score",   0)),
                    outcome_score    = float(m.get("outcome_score", 0)),
                    kalshi_leg       = kalshi_leg,
                    poly_leg         = poly_leg,
                    kalshi_ask       = kalshi_ask,
                    poly_ask         = poly_ask,
                    gross_cost       = round(gross_cost,     4),
                    gross_spread     = round(gross_spread,   4),
                    net_profit_pct   = round(net_profit_pct, 4),
                    poly_url         = poly_url,
                    kalshi_url       = kalshi_url,
                )
            )

    return opportunities


if __name__ == "__main__":
    matches = pd.read_csv("matched_markets.csv").to_dict(orient="records")
    print(f"Loaded {len(matches)} matched pairs. Scanning for arbitrage...")

    opps = find_arbitrage_opportunities(matches)

    opps_df = pd.DataFrame(
        [vars(o) for o in opps],
        columns=[f.name for f in fields(Opportunity)]
    )
    opps_df.to_csv("arbitrage_opportunities.csv", index=False)
    print(f"Found {len(opps)} arbitrage opportunities.")

    if not opps_df.empty:
        print("\nTop opportunities by net profit:")
        cols = ["poly_label", "kalshi_label", "kalshi_leg", "poly_leg", "kalshi_ask",
                "poly_ask", "gross_cost", "net_profit_pct", "poly_url", "kalshi_url"]
        print(opps_df.sort_values("net_profit_pct", ascending=False)[cols].head(10).to_string(index=False))