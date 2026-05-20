import pmxt
import config
import pandas as pd
import re
import json
import time
import requests
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np

kalshi_ex = pmxt.Exchange("KALSHI")

model = SentenceTransformer("all-MiniLM-L6-v2")

# ── POLYMARKET: fetch via Gamma events endpoint (mirrors test.py) ─────────────
# /events returns events with nested markets, giving clean parent-level grouping.

def fetch_poly_events_gamma() -> list:
    """
    Fetch all active Polymarket events from the Gamma API (same pagination as
    test.py).  Each event dict has a 'markets' list; we annotate each market
    with '_event_title' and '_event_url' before flattening.
    """
    flat_markets = []
    i = 1
    while True:
        url = (
            f"https://gamma-api.polymarket.com/events"
            f"?active=true&closed=false&limit=100&offset={(i - 1) * 100}"
        )
        response = requests.get(url, timeout=60)
        if response.status_code != 200:
            break
        batch = response.json()
        if not batch:
            break
        for event in batch:
            slug = event.get("slug", "")
            event_url = f"https://polymarket.com/event/{slug}" if slug else None
            for m in event.get("markets", []):
                m["_event_title"]    = event.get("title", "")
                m["_event_url"]      = event_url
                m["_event_end_date"] = (event.get("endDate") or "")[:10]  # keep YYYY-MM-DD only
                m["_event_icon"]     = event.get("icon") or event.get("image") or ""
                flat_markets.append(m)
        if len(batch) < 100:
            break
        i += 1
        time.sleep(0.1)
    return flat_markets


# ── STEP 1: PARSE MARKETS ─────────────────────────────────────────────────────

def parse_poly_market(m: dict) -> dict:
    parent = m.get("_event_title") or m.get("question", "")

    # Prefer groupItemTitle as the outcome label (e.g. "Spain", "December 31 2025")
    group_title = m.get("groupItemTitle") or ""
    outcome_label = None
    if group_title and not re.match(r"^(yes|no|not\b)", group_title, re.IGNORECASE):
        outcome_label = group_title

    if not outcome_label:
        # Fall back to question text: strip the parent prefix if present
        question = m.get("question", "")
        if " - " in question:
            _, tail = question.split(" - ", 1)
            outcome_label = tail.strip()
        else:
            outcome_label = question

    prices_raw = m.get("outcomePrices", "[]")
    try:
        prices = json.loads(prices_raw) if isinstance(prices_raw, str) else (prices_raw or [])
        price = float(prices[0]) if prices else None
    except Exception:
        price = None

    return {
        "market_id":    str(m.get("id", "")),
        "parent":       parent.strip(),
        "outcome_label": outcome_label or parent,
        "price":        price,
    }


def parse_kalshi_market(m) -> dict:
    outcome_label = None
    if hasattr(m, "outcomes") and m.outcomes:
        yes = getattr(m, "yes", None) or m.outcomes[0]
        label = yes.label
        if label and not re.match(r"^(yes|no|not\b)", label, re.IGNORECASE):
            outcome_label = label

    return {
        "market_id":    m.market_id,
        "parent":       m.title.strip(),
        "outcome_label": outcome_label or m.title,
        "price":        m.yes.price if hasattr(m, "yes") and m.yes else None,
    }


# ── STEP 2: FETCH ─────────────────────────────────────────────────────────────

print("Fetching markets...")
kalshi_markets_raw = kalshi_ex.fetch_markets()
print(f"  Kalshi:     {len(kalshi_markets_raw)} markets")
poly_markets_raw   = fetch_poly_events_gamma()
print(f"  Polymarket: {len(poly_markets_raw)} markets")


# ── STEP 3: BUILD PRICE + URL LOOKUP MAPS ────────────────────────────────────

def _kalshi_url(market_id: str) -> str:
    parts = market_id.split("-")
    event_slug = "-".join(parts[:-1]).upper() if len(parts) >= 2 else market_id
    return f"https://kalshi.com/events/{event_slug}"

def _poly_price_entry(m: dict) -> dict:
    prices_raw = m.get("outcomePrices", "[]")
    try:
        prices = json.loads(prices_raw) if isinstance(prices_raw, str) else (prices_raw or [])
        yes_ask = float(prices[0]) if len(prices) > 0 else None
        no_ask  = float(prices[1]) if len(prices) > 1 else None
    except Exception:
        yes_ask = no_ask = None
    return {
        "yes_ask":  yes_ask,
        "no_ask":   no_ask,
        "url":      m.get("_event_url"),
        "end_date": m.get("_event_end_date", ""),
        "icon":     m.get("_event_icon", ""),
    }

poly_price_map = {str(m.get("id", "")): _poly_price_entry(m) for m in poly_markets_raw}
def _kalshi_end_date(m) -> str:
    rd = getattr(m, "resolution_date", None)
    if rd is None:
        return ""
    try:
        return rd.strftime("%Y-%m-%d")
    except Exception:
        return str(rd)[:10]

kalshi_price_map = {
    str(m.market_id): {
        "yes_ask":  m.yes.price if (hasattr(m, "yes") and m.yes) else None,
        "no_ask":   m.no.price  if (hasattr(m, "no")  and m.no)  else None,
        "url":      getattr(m, "url", None) or _kalshi_url(str(m.market_id)),
        "end_date": _kalshi_end_date(m),
    }
    for m in kalshi_markets_raw
}

poly_parsed   = [parse_poly_market(m)   for m in poly_markets_raw]
kalshi_parsed = [parse_kalshi_market(m) for m in kalshi_markets_raw]

df_poly   = pd.DataFrame(poly_parsed)
df_kalshi = pd.DataFrame(kalshi_parsed)


# ── STEP 4: GROUP BY PARENT EVENT ────────────────────────────────────────────

poly_events = (
    df_poly
    .groupby("parent")
    .agg(outcomes=("market_id", list), labels=("outcome_label", list))
    .reset_index()
)

kalshi_events = (
    df_kalshi
    .groupby("parent")
    .agg(outcomes=("market_id", list), labels=("outcome_label", list))
    .reset_index()
)

print(f"  Poly events:   {len(poly_events)}")
print(f"  Kalshi events: {len(kalshi_events)}")


# ── STEP 5: MATCH EVENTS ACROSS PLATFORMS ────────────────────────────────────

poly_parents   = poly_events["parent"].tolist()
kalshi_parents = kalshi_events["parent"].tolist()

print("Encoding event titles...")
poly_embs   = model.encode(poly_parents,   normalize_embeddings=True, show_progress_bar=True)
kalshi_embs = model.encode(kalshi_parents, normalize_embeddings=True, show_progress_bar=True)

sim_matrix = cosine_similarity(poly_embs, kalshi_embs)

EVENT_THRESH = 0.75

event_matches = []
for i, poly_event in poly_events.iterrows():
    best_j     = int(np.argmax(sim_matrix[i]))
    best_score = float(sim_matrix[i][best_j])
    if best_score >= EVENT_THRESH:
        event_matches.append({
            "poly_event":      poly_event["parent"],
            "kalshi_event":    kalshi_events.iloc[best_j]["parent"],
            "event_score":     round(best_score, 4),
            "poly_outcomes":   poly_event["outcomes"],
            "kalshi_outcomes": kalshi_events.iloc[best_j]["outcomes"],
            "poly_labels":     poly_event["labels"],
            "kalshi_labels":   kalshi_events.iloc[best_j]["labels"],
        })

print(f"  Matched events: {len(event_matches)}")


# ── STEP 6: MATCH OUTCOMES WITHIN EACH EVENT PAIR ────────────────────────────

def match_outcomes(poly_ids, poly_labels, kalshi_ids, kalshi_labels) -> list:
    if not poly_labels or not kalshi_labels:
        return []

    p_embs = model.encode(poly_labels,   normalize_embeddings=True)
    k_embs = model.encode(kalshi_labels, normalize_embeddings=True)
    sim    = cosine_similarity(p_embs, k_embs)

    OUTCOME_THRESH = 0.80
    pairs = []
    for pi, (pid, plabel) in enumerate(zip(poly_ids, poly_labels)):
        best_ki    = int(np.argmax(sim[pi]))
        best_score = float(sim[pi][best_ki])
        if best_score >= OUTCOME_THRESH:
            pairs.append({
                "poly_market_id":   pid,
                "poly_label":       plabel,
                "kalshi_market_id": kalshi_ids[best_ki],
                "kalshi_label":     kalshi_labels[best_ki],
                "outcome_score":    round(best_score, 4),
            })
    return pairs


# ── STEP 7: FLATTEN TO OUTPUT CSV ────────────────────────────────────────────

rows = []
for ev in event_matches:
    outcome_pairs = match_outcomes(
        ev["poly_outcomes"], ev["poly_labels"],
        ev["kalshi_outcomes"], ev["kalshi_labels"],
    )
    for op in outcome_pairs:
        pp = poly_price_map.get(str(op["poly_market_id"]), {})
        kp = kalshi_price_map.get(str(op["kalshi_market_id"]), {})
        rows.append({
            "poly_event":       ev["poly_event"],
            "kalshi_event":     ev["kalshi_event"],
            "event_score":      ev["event_score"],
            "poly_market_id":   op["poly_market_id"],
            "poly_label":       op["poly_label"],
            "kalshi_market_id": op["kalshi_market_id"],
            "kalshi_label":     op["kalshi_label"],
            "outcome_score":    op["outcome_score"],
            "poly_yes_ask":     pp.get("yes_ask"),
            "poly_no_ask":      pp.get("no_ask"),
            "poly_url":         pp.get("url"),
            "poly_end_date":    pp.get("end_date", ""),
            "event_icon":       pp.get("icon", ""),
            "kalshi_yes_ask":   kp.get("yes_ask"),
            "kalshi_no_ask":    kp.get("no_ask"),
            "kalshi_url":       kp.get("url"),
            "kalshi_end_date":  kp.get("end_date", ""),
        })

df_out = pd.DataFrame(rows)
df_out.to_csv("matched_markets.csv", index=False)
print(f"Written {len(df_out)} outcome-level pairs to matched_markets.csv")
print(df_out.head(20).to_string())
