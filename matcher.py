import pmxt
import config
import pandas as pd
import re
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np

kalshi_ex = pmxt.Exchange("KALSHI", api_key=config.KALSHI_API_KEY)
poly_ex   = pmxt.Exchange("POLYMARKET")

model = SentenceTransformer("all-MiniLM-L6-v2")

# ── STEP 1: GROUP POLYMARKET BY PARENT EVENT ──────────────────────────────────
# Polymarket title format: "Parent Event - Specific Outcome"
# We want to group all outcomes under the same parent together

def parse_poly_market(m) -> dict:
    title = m.title
    if " - " in title:
        parent, outcome_question = title.split(" - ", 1)
    else:
        parent = title
        outcome_question = title

    # Get the real outcome label from the yes-outcome
    outcome_label = None
    if m.outcomes:
        yes = m.yes or m.outcomes[0]
        label = yes.label
        if label and not re.match(r'^(yes|no|not\b)', label, re.IGNORECASE):
            outcome_label = label

    return {
        "market_id":       m.market_id,
        "parent":          parent.strip(),
        "outcome_question": outcome_question.strip(),
        "outcome_label":   outcome_label or outcome_question,
        "price":           m.yes.price if m.yes else None,
    }


def parse_kalshi_market(m) -> dict:
    # Kalshi market_ids encode the option, e.g. KXPRESPERSON-28-GNEWS
    # The title is the same for all options in a group, e.g. "2028 U.S. Presidential Election winner?"
    # The outcome label comes from outcomes[0].label the same way
    outcome_label = None
    if hasattr(m, "outcomes") and m.outcomes:
        yes = getattr(m, "yes", None) or m.outcomes[0]
        label = yes.label
        if label and not re.match(r'^(yes|no|not\b)', label, re.IGNORECASE):
            outcome_label = label

    return {
        "market_id":     m.market_id,
        "parent":        m.title.strip(),
        "outcome_label": outcome_label or m.title,
        "price":         m.yes.price if hasattr(m, "yes") and m.yes else None,
    }


# ── STEP 2: BUILD EVENT-LEVEL GROUPS ─────────────────────────────────────────

print("Fetching markets...")
kalshi_markets_raw = kalshi_ex.fetch_markets()
poly_markets_raw   = poly_ex.fetch_markets()

# Build price + URL lookup dicts now so arbitrage.py needs no extra API calls
def _kalshi_url(market_id: str) -> str:
    parts = market_id.split("-")
    event_slug = "-".join(parts[:-1]).upper() if len(parts) >= 2 else market_id
    return f"https://kalshi.com/events/{event_slug}"

poly_price_map = {
    str(m.market_id): {
        "yes_ask": m.yes.price if (hasattr(m, "yes") and m.yes) else None,
        "no_ask":  m.no.price  if (hasattr(m, "no")  and m.no)  else None,
        "url":     getattr(m, "url", None),
    }
    for m in poly_markets_raw
}
kalshi_price_map = {
    str(m.market_id): {
        "yes_ask": m.yes.price if (hasattr(m, "yes") and m.yes) else None,
        "no_ask":  m.no.price  if (hasattr(m, "no")  and m.no)  else None,
        "url":     getattr(m, "url", None) or _kalshi_url(str(m.market_id)),
    }
    for m in kalshi_markets_raw
}

poly_parsed   = [parse_poly_market(m)   for m in poly_markets_raw]
kalshi_parsed = [parse_kalshi_market(m) for m in kalshi_markets_raw]

df_poly   = pd.DataFrame(poly_parsed)
df_kalshi = pd.DataFrame(kalshi_parsed)

# Group: one row per unique parent event, with list of outcomes
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

print(f"Poly events:   {len(poly_events)}")
print(f"Kalshi events: {len(kalshi_events)}")


# ── STEP 3: MATCH EVENTS ACROSS PLATFORMS ────────────────────────────────────
# Embed parent event titles and find closest matches

poly_parents   = poly_events["parent"].tolist()
kalshi_parents = kalshi_events["parent"].tolist()

print("Encoding event titles...")
poly_embs   = model.encode(poly_parents,   normalize_embeddings=True, show_progress_bar=True)
kalshi_embs = model.encode(kalshi_parents, normalize_embeddings=True, show_progress_bar=True)

sim_matrix = cosine_similarity(poly_embs, kalshi_embs)  # (n_poly_events, n_kalshi_events)

EVENT_THRESH = 0.75   # minimum similarity to consider events a match

event_matches = []
for i, poly_event in poly_events.iterrows():
    best_j   = int(np.argmax(sim_matrix[i]))
    best_score = float(sim_matrix[i][best_j])
    if best_score >= EVENT_THRESH:
        event_matches.append({
            "poly_event":   poly_event["parent"],
            "kalshi_event": kalshi_events.iloc[best_j]["parent"],
            "event_score":  round(best_score, 4),
            "poly_outcomes":   poly_event["outcomes"],   # list of market_ids
            "kalshi_outcomes": kalshi_events.iloc[best_j]["outcomes"],
            "poly_labels":     poly_event["labels"],
            "kalshi_labels":   kalshi_events.iloc[best_j]["labels"],
        })

print(f"Matched events: {len(event_matches)}")


# ── STEP 4: MATCH OUTCOMES WITHIN EACH EVENT PAIR ────────────────────────────
# For each matched event, pair up individual outcomes by label similarity

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


# ── STEP 5: FLATTEN TO OUTPUT CSV ────────────────────────────────────────────

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
            "kalshi_yes_ask":   kp.get("yes_ask"),
            "kalshi_no_ask":    kp.get("no_ask"),
            "kalshi_url":       kp.get("url"),
        })

df_out = pd.DataFrame(rows)
df_out.to_csv("matched_markets.csv", index=False)
print(f"Written {len(df_out)} outcome-level pairs to matched_markets.csv")
print(df_out.head(20).to_string())