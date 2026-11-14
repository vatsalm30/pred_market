import config
import pandas as pd
import re
import json
import time
import requests
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np
from datetime import datetime
from types import SimpleNamespace
from fetch_prices import poly_asks

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
                # A market's own end date; the parent event's can be far later for multi-outcome events
                m["_event_end_date"] = (m.get("endDate") or event.get("endDate") or "")[:10]
                m["_event_icon"]      = event.get("icon") or event.get("image") or ""
                m["_event_volume"]    = float(event.get("volume")    or event.get("volumeNum")    or 0)
                m["_event_volume_24h"] = float(event.get("volume24hr") or event.get("volume24hrClob") or 0)
                flat_markets.append(m)
        if len(batch) < 100:
            break
        i += 1
        time.sleep(0.1)
    return flat_markets


# ── KALSHI: fetch open events with nested markets ────────────────────────────
# Same /events pagination and field mapping as pmxt's Kalshi normalizer, but
# paced and authenticated: pmxt fetches every page back-to-back unauthenticated,
# which Kalshi rate-limits (429) on the full ~250k-market scan.

def _kalshi_label(raw):
    for key in ("yes_sub_title", "subtitle"):
        v = (raw.get(key) or "").strip()
        if v and not v.startswith("::"):
            return v
    return None


def _kalshi_last_price(raw) -> float:
    if raw.get("last_price_dollars") is not None:
        return float(raw["last_price_dollars"])
    ask, bid = raw.get("yes_ask_dollars"), raw.get("yes_bid_dollars")
    if ask is not None and bid is not None:
        return (float(ask) + float(bid)) / 2
    if ask is not None:
        return float(ask)
    return 0.0


def fetch_kalshi_markets() -> list:
    headers = {"Authorization": f"Bearer {config.KALSHI_API_KEY}"} if config.KALSHI_API_KEY else {}
    markets, cursor = [], None
    while True:
        params = {"limit": 200, "with_nested_markets": "true", "status": "open"}
        if cursor:
            params["cursor"] = cursor
        for attempt in range(6):
            r = requests.get(f"{config.KALSHI_BASE_URL}/events", headers=headers, params=params, timeout=60)
            if r.status_code != 429:
                break
            time.sleep(min(60, 5 * 2 ** attempt))
        r.raise_for_status()
        data = r.json()
        events = data.get("events") or []
        for event in events:
            for raw in event.get("markets") or []:
                price = _kalshi_last_price(raw)
                label = _kalshi_label(raw)
                yes = SimpleNamespace(label=label or "Yes", price=price)
                no = SimpleNamespace(label=f"Not {label}" if label else "No", price=1 - price)
                # expected_expiration_time is when the market should settle; expiration_time is
                # the last date it *can* settle, often years later, so it never matched Polymarket's
                try:
                    when = raw.get("expected_expiration_time") or raw.get("close_time") or raw["expiration_time"]
                    resolution = datetime.fromisoformat(when.replace("Z", "+00:00"))
                except (KeyError, ValueError, AttributeError):
                    resolution = None
                markets.append(SimpleNamespace(
                    market_id=raw["ticker"],
                    title=event.get("title", ""),
                    question=raw.get("title", ""),
                    outcomes=[yes, no],
                    yes=yes,
                    no=no,
                    resolution_date=resolution,
                    volume=float(raw.get("volume_fp") or raw.get("volume") or 0),
                    volume_24h=float(raw.get("volume_24h_fp") or raw.get("volume_24h") or raw.get("volume") or 0),
                    url=f"https://kalshi.com/events/{event.get('event_ticker', '')}",
                ))
        cursor = data.get("cursor")
        if not events or not cursor:
            break
        time.sleep(config.KALSHI_PAGE_DELAY)
    return markets


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
        "question":     m.get("question", ""),
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
        "question":     getattr(m, "question", "") or m.title,
        "price":        m.yes.price if hasattr(m, "yes") and m.yes else None,
    }


# ── STEP 2: FETCH ─────────────────────────────────────────────────────────────

print("Fetching markets...")
kalshi_markets_raw = fetch_kalshi_markets()
print(f"  Kalshi:     {len(kalshi_markets_raw)} markets")
poly_markets_raw   = fetch_poly_events_gamma()
print(f"  Polymarket: {len(poly_markets_raw)} markets")


# ── STEP 3: BUILD PRICE + URL LOOKUP MAPS ────────────────────────────────────

def _kalshi_url(market_id: str) -> str:
    parts = market_id.split("-")
    event_slug = "-".join(parts[:-1]).upper() if len(parts) >= 2 else market_id
    return f"https://kalshi.com/events/{event_slug}"

def _poly_price_entry(m: dict) -> dict:
    yes_ask, no_ask = poly_asks(m)
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
    .agg(outcomes=("market_id", list), labels=("outcome_label", list), questions=("question", list))
    .reset_index()
)

kalshi_events = (
    df_kalshi
    .groupby("parent")
    .agg(outcomes=("market_id", list), labels=("outcome_label", list), questions=("question", list))
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

# ── Hard checks: things embeddings get wrong no matter how high the score ────

_NUM_RE   = re.compile(r"(?<![\w.])[-+]?\$?\d[\d,]*(?:\.\d+)?\s*[kKmMbB%]?")
_YEAR_RE  = re.compile(r"\b(20[2-3]\d)\b")
_RANGE_RE = re.compile(r"\d[\d,.]*\s*[kKmM%]?\s*(?:-|–|—|to)\s*\d")
_THRESH_RE = re.compile(r"[<>≤≥]|\b(?:at least|at most|or more|or less|or fewer|above|below|over|under|more than|less than|fewer than)\b", re.I)

def _numbers(s: str) -> set:
    """Numeric tokens as comparable values: '$150k' -> 150000, '14%' -> 14, '1,500' -> 1500."""
    out = set()
    for tok in _NUM_RE.findall(s.replace("−", "-")):
        t = tok.strip().lower().replace("$", "").replace(",", "")
        mult = 1
        if t.endswith("k"): mult, t = 1e3, t[:-1]
        elif t.endswith("m"): mult, t = 1e6, t[:-1]
        elif t.endswith("b"): mult, t = 1e9, t[:-1]
        elif t.endswith("%"): t = t[:-1]
        try:
            out.add(round(float(t) * mult, 6))
        except ValueError:
            pass
    return out

def _years(s: str) -> set:
    return set(_YEAR_RE.findall(s))

def _label_shape(s: str) -> str:
    if _RANGE_RE.search(s): return "range"
    if _THRESH_RE.search(s): return "threshold"
    return "plain"

def event_titles_compatible(a: str, b: str) -> bool:
    ya, yb = _years(a), _years(b)
    if ya and yb and ya != yb:
        return False  # different years
    return True

def labels_compatible(a: str, b: str) -> bool:
    """Reject outcome pairs whose numbers or shape disagree ('14-16%' vs '>=14%', '$150k' vs '$100k')."""
    na, nb = _numbers(a), _numbers(b)
    if na and nb:
        if na != nb:
            return False
        sa, sb = _label_shape(a), _label_shape(b)
        if sa != sb and "plain" not in (sa, sb):
            return False  # a range and a threshold are different questions
    ya, yb = _years(a), _years(b)
    if ya and yb and ya != yb:
        return False
    return True

_SUPERLATIVE_RE = re.compile(r"\b(?:most|fewest|highest|lowest|leader|top|first|last|#\s?1|number one|winner)\b", re.I)

def _question_shape(s: str) -> str:
    if _RANGE_RE.search(s): return "range"
    if _THRESH_RE.search(s) or re.search(r"\d\s*\+", s): return "threshold"
    if _SUPERLATIVE_RE.search(s): return "superlative"
    return "plain"

def questions_compatible(a: str, b: str) -> bool:
    """Full question texts: '6+ rushing touchdowns' is not 'the most rushing touchdowns'.
    Years are checked elsewhere, so they're ignored here."""
    # Years and season strings ("2025-26", "2026/27") are checked elsewhere and look like ranges
    strip = lambda s: _YEAR_RE.sub(" ", re.sub(r"\b20\d\d\s*[-–/]\s*\d\d\b", " ", s))
    a, b = strip(a), strip(b)
    sa, sb = _question_shape(a), _question_shape(b)
    if {sa, sb} & {"range", "threshold"} and {sa, sb} & {"superlative"}:
        return False
    if sa != sb and "plain" not in (sa, sb) and sa != sb:
        if {sa, sb} == {"range", "threshold"}:
            return False
    na, nb = _numbers(a), _numbers(b)
    if na != nb and ({sa, sb} & {"range", "threshold"}):
        return False
    return True

def _settled(price) -> bool:
    """Prices at the extremes mean the market has effectively resolved; its 'gaps' are not tradable."""
    return price is not None and (price <= 0.01 or price >= 0.99)

event_matches = []
for i, poly_event in poly_events.iterrows():
    # Best candidate that passes the hard checks, not just the top embedding score
    order = np.argsort(-sim_matrix[i])[:5]
    best_j, best_score = None, 0.0
    for j in order:
        score = float(sim_matrix[i][j])
        if score < EVENT_THRESH:
            break
        if event_titles_compatible(poly_event["parent"], kalshi_events.iloc[int(j)]["parent"]):
            best_j, best_score = int(j), score
            break
    if best_j is not None:
        event_matches.append({
            "poly_event":      poly_event["parent"],
            "kalshi_event":    kalshi_events.iloc[best_j]["parent"],
            "event_score":     round(best_score, 4),
            "poly_outcomes":   poly_event["outcomes"],
            "kalshi_outcomes": kalshi_events.iloc[best_j]["outcomes"],
            "poly_labels":     poly_event["labels"],
            "kalshi_labels":   kalshi_events.iloc[best_j]["labels"],
            "poly_questions":  poly_event["questions"],
            "kalshi_questions": kalshi_events.iloc[best_j]["questions"],
        })

print(f"  Matched events: {len(event_matches)}")


# ── STEP 6: MATCH OUTCOMES WITHIN EACH EVENT PAIR ────────────────────────────

def match_outcomes(poly_ids, poly_labels, kalshi_ids, kalshi_labels, poly_qs=None, kalshi_qs=None) -> list:
    if not poly_labels or not kalshi_labels:
        return []
    poly_qs = poly_qs or [""] * len(poly_labels)
    kalshi_qs = kalshi_qs or [""] * len(kalshi_labels)

    p_embs = model.encode(poly_labels,   normalize_embeddings=True)
    k_embs = model.encode(kalshi_labels, normalize_embeddings=True)
    sim    = cosine_similarity(p_embs, k_embs)

    OUTCOME_THRESH = 0.80
    # Every (poly, kalshi) candidate above the threshold that passes the hard checks,
    # then greedy one-to-one assignment from the best score down, so one Kalshi market
    # can't be claimed by several Polymarket markets (or vice versa).
    cands = []
    for pi, plabel in enumerate(poly_labels):
        for ki, klabel in enumerate(kalshi_labels):
            score = float(sim[pi][ki])
            if score >= OUTCOME_THRESH and labels_compatible(plabel, klabel) and questions_compatible(poly_qs[pi], kalshi_qs[ki]):
                cands.append((score, pi, ki))
    cands.sort(reverse=True)
    used_p, used_k, pairs = set(), set(), []
    for score, pi, ki in cands:
        if pi in used_p or ki in used_k:
            continue
        used_p.add(pi); used_k.add(ki)
        pairs.append({
            "poly_market_id":   poly_ids[pi],
            "poly_label":       poly_labels[pi],
            "kalshi_market_id": kalshi_ids[ki],
            "kalshi_label":     kalshi_labels[ki],
            "outcome_score":    round(score, 4),
            "poly_question":    poly_qs[pi],
            "kalshi_question":  kalshi_qs[ki],
        })
    return pairs


# ── STEP 7: FLATTEN TO OUTPUT CSV ────────────────────────────────────────────

rows = []
for ev in event_matches:
    outcome_pairs = match_outcomes(
        ev["poly_outcomes"], ev["poly_labels"],
        ev["kalshi_outcomes"], ev["kalshi_labels"],
        ev["poly_questions"], ev["kalshi_questions"],
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
            "poly_question":    op.get("poly_question", ""),
            "kalshi_question":  op.get("kalshi_question", ""),
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
before = len(df_out)
# Settled markets: both asks pinned to an extreme on either venue
def _row_settled(r):
    return (_settled(r.get("poly_yes_ask")) and _settled(r.get("poly_no_ask"))) or \
           (_settled(r.get("kalshi_yes_ask")) and _settled(r.get("kalshi_no_ask")))
MAX_END_DATE_GAP_DAYS = 90  # "before 2027" and "before 2029" are different questions
def _dates_far_apart(r):
    try:
        a = datetime.fromisoformat(str(r.get("poly_end_date"))[:10]); b = datetime.fromisoformat(str(r.get("kalshi_end_date"))[:10])
        return abs((a - b).days) > MAX_END_DATE_GAP_DAYS
    except (TypeError, ValueError):
        return False
if before:
    df_out = df_out[~df_out.apply(_row_settled, axis=1)]
    df_out = df_out[~df_out.apply(_dates_far_apart, axis=1)]
    # One Kalshi market, one Polymarket market: keep the best-scoring pair when events overlap
    df_out = (df_out.sort_values(["outcome_score", "event_score"], ascending=False)
                    .drop_duplicates("kalshi_market_id").drop_duplicates("poly_market_id"))
print(f"  Dropped {before - len(df_out)} settled or duplicate pairs")
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

def _top_outcomes(market_ids, labels, price_map, limit=12):
    """Return outcomes sorted by price descending, up to limit."""
    items = []
    for mid, label in zip(market_ids, labels):
        price = price_map.get(str(mid), {}).get("yes_ask")
        if price is not None:
            items.append({"label": label, "price": round(price, 4)})
    items.sort(key=lambda x: -x["price"])
    return items[:limit]

for _, row in poly_events.iterrows():
    pkey    = row["parent"]
    poids   = row["outcomes"]
    plabels = row["labels"]
    pp      = poly_price_map.get(str(poids[0]), {}) if poids else {}
    match   = poly_to_match.get(pkey)

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
        "top_outcomes":    [] if match else _top_outcomes(poids, plabels, poly_price_map),
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
    kkey    = row["parent"]
    if kkey in matched_kalshi_set:
        continue
    koids   = row["outcomes"]
    klabels = row["labels"]
    kp      = kalshi_price_map.get(str(koids[0]), {}) if koids else {}
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
        "top_outcomes":    _top_outcomes(koids, klabels, kalshi_price_map),
    })

all_event_list.sort(key=lambda x: -(x["volume"] or 0))

with open("all_events.json", "w") as _f:
    json.dump(all_event_list, _f)
print(f"Written {len(all_event_list)} events to all_events.json")
