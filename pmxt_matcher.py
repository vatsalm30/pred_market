import pmxt
import config
import pandas as pd
import re

kalshi = pmxt.Exchange("KALSHI", api_key=config.KALSHI_API_KEY)
poly = pmxt.Exchange("POLYMARKET")

PLACEHOLDER = re.compile(
    r'\b(person|candidate|player|team|golfer|driver|leader|party|company|option|movie|ticker|club)\s+[a-z]{1,3}\b',
    re.IGNORECASE
)

def resolve_poly_title(market) -> str:
    title = market.title

    if not PLACEHOLDER.search(title):
        return title

    # The "yes" outcome label is the real option name (e.g. "Gavin Newsom")
    real_label = None
    if market.outcomes:
        yes_outcome = market.yes or market.outcomes[0]
        label = yes_outcome.label
        # Skip generic labels like "Yes", "by June 30, 2026", "Not by ..." etc.
        if label and not re.match(r'^(yes|no|not\b)', label, re.IGNORECASE):
            real_label = label

    if not real_label:
        return title

    # Replace the placeholder with the real label
    if " - " in title:
        parent = title.split(" - ", 1)[0].strip()
        return f"{parent} - Will {real_label} win?"

    return PLACEHOLDER.sub(real_label, title)


def get_all_markets():
    kalshi_markets = kalshi.fetch_markets()
    poly_markets = poly.fetch_markets()
    return kalshi_markets, poly_markets


print("Fetching markets...")
kalshi_markets, poly_markets = get_all_markets()
print(f"Fetched {len(kalshi_markets)} Kalshi markets and {len(poly_markets)} Polymarket markets.")

poly_rows = []
placeholder_count = 0

for m in poly_markets:
    original_title = m.title
    resolved_title = resolve_poly_title(m)

    if resolved_title != original_title:
        placeholder_count += 1

    poly_rows.append({
        "market_id":      m.market_id,
        "title":          resolved_title,
        "original_title": original_title,
    })

df_poly = pd.DataFrame(poly_rows)
df_kalshi = pd.DataFrame([
    {"market_id": m.market_id, "title": m.title}
    for m in kalshi_markets
])

print(f"Resolved {placeholder_count} placeholder titles out of {len(df_poly)} Polymarket markets.")

df_kalshi.to_csv("kalshi_markets.csv", index=False)
df_poly.to_csv("polymarket_markets.csv", index=False)