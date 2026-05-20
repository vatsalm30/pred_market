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
                m["_event_icon"]      = event.get("icon") or event.get("image") or ""
                m["_event_volume"]    = float(event.get("volume")    or event.get("volumeNum")    or 0)
                m["_event_volume_24h"] = float(event.get("volume24hr") or event.get("volume24hrClob") or 0)
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
        "yes_ask":    yes_ask,
        "no_ask":     no_ask,
        "url":        m.get("_event_url"),
        "end_date":   m.get("_event_end_date", ""),
        "icon":       m.get("_event_icon", ""),
        "volume":     m.get("_event_volume",    0),
        "volume_24h": m.get("_event_volume_24h", 0),
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
        "yes_ask":    m.yes.price if (hasattr(m, "yes") and m.yes) else None,
        "no_ask":     m.no.price  if (hasattr(m, "no")  and m.no)  else None,
        "url":        getattr(m, "url", None) or _kalshi_url(str(m.market_id)),
        "end_date":   _kalshi_end_date(m),
        "volume":     float(getattr(m, "volume",     0) or 0),
        "volume_24h": float(getattr(m, "volume_24h", 0) or 0),
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
            "poly_volume":      pp.get("volume",   0),
            "kalshi_volume":    kp.get("volume",   0),
        })

df_out = pd.DataFrame(rows)
df_out.to_csv("matched_markets.csv", index=False)
print(f"Written {len(df_out)} outcome-level pairs to matched_markets.csv")
print(df_out.head(20).to_string())


# ── STEP 8: EXPORT ALL EVENTS ─────────────────────────────────────────────────

def _cat(event: str) -> str:
    lower = event.lower()
    if re.search(r'election|president|senate|congress|governor|prime minister|ballot|vote|poll', lower):
        return 'Politics'
    if re.search(r'fifa|world cup|nba|nfl|pga|tennis|soccer|basketball|baseball|hockey|sport|golf|tournament|champion', lower):
        return 'Sports'
    if re.search(r'bitcoin|crypto|eth|fed|rate|gdp|economy|inflation|recession|stock|dollar', lower):
        return 'Economics'
    if re.search(r'\bai\b|tech|apple|elon|musk|openai|spacex|tesla', lower):
        return 'Tech'
    return 'Other'

def _slug(title: str, prefix: str = "") -> str:
    return (prefix + re.sub(r'[^a-z0-9]+', '-', title.lower()).strip('-'))[:80]

matched_poly_set   = {e["poly_event"]   for e in event_matches}
matched_kalshi_set = {e["kalshi_event"] for e in event_matches}
poly_to_match      = {e["poly_event"]: e for e in event_matches}

def _max_yes(price_map, market_ids):
    prices = [price_map.get(str(mid), {}).get("yes_ask") for mid in market_ids]
    prices = [p for p in prices if p is not None]
    return max(prices) if prices else None

all_event_list = []

for _, row in poly_events.iterrows():
    pkey  = row["parent"]
    poids = row["outcomes"]
    pp    = poly_price_map.get(str(poids[0]), {}) if poids else {}
    match = poly_to_match.get(pkey)

    entry = {
        "id":              _slug(pkey),
        "title":           pkey,
        "icon":            pp.get("icon", ""),
        "platforms":       ["polymarket", "kalshi"] if match else ["polymarket"],
        "poly_url":        pp.get("url"),
        "kalshi_url":      None,
        "volume":          pp.get("volume", 0) or 0,
        "volume_24h":      pp.get("volume_24h", 0) or 0,
        "end_date":        pp.get("end_date", ""),
        "category":        _cat(pkey),
        "yes_price_poly":  _max_yes(poly_price_map, poids),
        "yes_price_kalshi": None,
        "num_outcomes":    len(poids),
        "is_matched":      bool(match),
        "event_score":     match["event_score"] if match else None,
    }

    if match:
        koids = match["kalshi_outcomes"]
        kp    = kalshi_price_map.get(str(koids[0]), {}) if koids else {}
        entry["kalshi_url"]       = kp.get("url")
        entry["yes_price_kalshi"] = _max_yes(kalshi_price_map, koids)
        # Add Kalshi volume to get combined cross-platform total
        k_vol     = sum(kalshi_price_map.get(str(mid), {}).get("volume",     0) or 0 for mid in koids)
        k_vol_24h = sum(kalshi_price_map.get(str(mid), {}).get("volume_24h", 0) or 0 for mid in koids)
        entry["volume"]     = (entry["volume"]     or 0) + k_vol
        entry["volume_24h"] = (entry["volume_24h"] or 0) + k_vol_24h

    all_event_list.append(entry)

for _, row in kalshi_events.iterrows():
    kkey  = row["parent"]
    if kkey in matched_kalshi_set:
        continue
    koids = row["outcomes"]
    kp    = kalshi_price_map.get(str(koids[0]), {}) if koids else {}
    k_vol     = sum(kalshi_price_map.get(str(mid), {}).get("volume",     0) or 0 for mid in koids)
    k_vol_24h = sum(kalshi_price_map.get(str(mid), {}).get("volume_24h", 0) or 0 for mid in koids)
    all_event_list.append({
        "id":              _slug(kkey, "kalshi-"),
        "title":           kkey,
        "icon":            "",
        "platforms":       ["kalshi"],
        "poly_url":        None,
        "kalshi_url":      kp.get("url"),
        "volume":          k_vol,
        "volume_24h":      k_vol_24h,
        "end_date":        kp.get("end_date", ""),
        "category":        _cat(kkey),
        "yes_price_poly":  None,
        "yes_price_kalshi": kp.get("yes_ask"),
        "num_outcomes":    len(koids),
        "is_matched":      False,
        "event_score":     None,
    })

all_event_list.sort(key=lambda x: -(x["volume"] or 0))

with open("all_events.json", "w") as _f:
    json.dump(all_event_list, _f)
print(f"Written {len(all_event_list)} events to all_events.json")
