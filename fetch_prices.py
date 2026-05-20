"""Lightweight price refresh — fetches prices only for matched tickers, no full market scan."""
import csv, json, os, time
import requests
from config import KALSHI_API_KEY

KALSHI_BASE  = "https://api.elections.kalshi.com/trade-api/v2"
POLY_GAMMA   = "https://gamma-api.polymarket.com/markets"
BATCH_SIZE   = 200   # Kalshi supports up to 200 tickers per request
POLY_BATCH   = 50


def fetch_kalshi_prices(tickers: list) -> dict:
    headers = {"Authorization": f"Bearer {KALSHI_API_KEY}"}
    prices = {}
    for i in range(0, len(tickers), BATCH_SIZE):
        batch = tickers[i:i + BATCH_SIZE]
        r = requests.get(
            f"{KALSHI_BASE}/markets",
            headers=headers,
            params={"tickers": ",".join(batch)},
            timeout=30,
        )
        r.raise_for_status()
        for m in r.json().get("markets", []):
            ticker = m.get("ticker", "")
            yes_ask = m.get("yes_ask_dollars")
            no_ask  = m.get("no_ask_dollars")
            if yes_ask is not None and no_ask is not None:
                prices[ticker] = {
                    "yes_ask": float(yes_ask),
                    "no_ask":  float(no_ask),
                }
        if i + BATCH_SIZE < len(tickers):
            time.sleep(0.3)
    return prices


def fetch_poly_prices(market_ids: list) -> dict:
    prices = {}
    for i in range(0, len(market_ids), POLY_BATCH):
        batch = market_ids[i:i + POLY_BATCH]
        try:
            query = "&".join(f"id={mid}" for mid in batch)
            r = requests.get(f"{POLY_GAMMA}?{query}", timeout=30)
            if not r.ok:
                continue
            for m in r.json():
                mid = str(m.get("id", ""))
                op = m.get("outcomePrices", "[]")
                if isinstance(op, str):
                    op = json.loads(op)
                if op and len(op) >= 2:
                    prices[mid] = {
                        "yes_ask": float(op[0]),
                        "no_ask":  float(op[1]),
                    }
        except Exception as e:
            print(f"  Poly batch error: {e}")
    return prices


if __name__ == "__main__":
    if not os.path.exists("matched_markets.csv"):
        print("matched_markets.csv not found — run matcher.py first")
        raise SystemExit(1)

    rows = []
    with open("matched_markets.csv", newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = list(reader.fieldnames or [])
        rows = list(reader)

    # Ensure price columns exist in fieldnames
    for col in ("kalshi_yes_ask", "kalshi_no_ask", "poly_yes_ask", "poly_no_ask"):
        if col not in fieldnames:
            fieldnames.append(col)

    kalshi_tickers = list({r["kalshi_market_id"] for r in rows if r.get("kalshi_market_id")})
    poly_ids       = list({r["poly_market_id"]   for r in rows if r.get("poly_market_id")})

    print(f"Fetching Kalshi prices for {len(kalshi_tickers)} tickers...")
    kalshi_prices = fetch_kalshi_prices(kalshi_tickers)
    print(f"  Got {len(kalshi_prices)} prices")

    print(f"Fetching Polymarket prices for {len(poly_ids)} markets...")
    poly_prices = fetch_poly_prices(poly_ids)
    print(f"  Got {len(poly_prices)} prices")

    updated = 0
    for row in rows:
        kp = kalshi_prices.get(row["kalshi_market_id"])
        pp = poly_prices.get(str(row["poly_market_id"]))
        if kp:
            row["kalshi_yes_ask"] = kp["yes_ask"]
            row["kalshi_no_ask"]  = kp["no_ask"]
            updated += 1
        if pp:
            row["poly_yes_ask"] = pp["yes_ask"]
            row["poly_no_ask"]  = pp["no_ask"]

    with open("matched_markets.csv", "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"Updated prices for {updated} matched pairs.")
