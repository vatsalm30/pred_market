"""Arbitrage opportunity detection — reads prices from matched_markets.csv, no extra API calls."""
from dataclasses import dataclass, fields
from datetime import datetime, timezone
from typing import List, Dict
from config import KALSHI_WIN_FEE, POLYMARKET_WIN_FEE, MIN_PROFIT_PCT
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

    poly_url: str
    kalshi_url: str
    poly_end_date: str
    kalshi_end_date: str

    @property
    def is_strong(self) -> bool:
        return self.net_profit_pct >= 3.0


def find_arbitrage_opportunities(matches: List[Dict]) -> List[Opportunity]:
    opportunities: List[Opportunity] = []

    def net_payout(ask: float, fee_rate: float) -> float:
        return 1.0 - fee_rate * (1.0 - ask)

    for m in matches:
        if float(m.get("outcome_score", 0)) < MIN_OUTCOME_SCORE:
            continue

        # Prices come from matched_markets.csv — no API call needed
        try:
            poly_yes   = float(m["poly_yes_ask"])
            poly_no    = float(m["poly_no_ask"])
            kalshi_yes = float(m["kalshi_yes_ask"])
            kalshi_no  = float(m["kalshi_no_ask"])
        except (TypeError, ValueError, KeyError):
            continue

        if None in (poly_yes, poly_no, kalshi_yes, kalshi_no):
            continue

        poly_url   = str(m.get("poly_url",   "") or "")
        kalshi_url = str(m.get("kalshi_url", "") or "")

        poly_id   = str(m["poly_market_id"])
        kalshi_id = str(m["kalshi_market_id"])

        for kalshi_leg, poly_leg, kalshi_ask, poly_ask in [
            ("YES", "NO",  kalshi_yes, poly_no),
            ("NO",  "YES", kalshi_no,  poly_yes),
        ]:
            if not (0 < kalshi_ask < 1 and 0 < poly_ask < 1):
                continue

            gross_cost     = kalshi_ask + poly_ask
            gross_spread   = 1.0 - gross_cost
            net_profit_pct = (1 - gross_cost) * 100 / gross_cost if gross_cost > 0 else 0

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
                    poly_end_date    = str(m.get("poly_end_date",   "") or ""),
                    kalshi_end_date  = str(m.get("kalshi_end_date", "") or ""),
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
