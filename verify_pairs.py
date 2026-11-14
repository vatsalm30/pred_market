"""LLM verification of matched pairs.

The embedding matcher pairs markets whose titles look alike. Text rules catch numbers,
dates and thresholds, but not wording like "#1 song" vs "#1 album" or "win" vs
"nominated". This step shows each pair's full questions, rules and dates to Claude and
asks whether a YES on one really settles on the same outcome as the other.

Verdicts are cached in pair_verdicts.json (persisted between runs by the GCP job) and
keyed on the question wording, so a pair is only judged again when its text changes.

Reads/writes matched_markets.csv in place:
  - rows judged "different" with confidence >= DROP_CONFIDENCE are removed
  - every remaining row gets llm_verdict (same | unsure | different) and llm_note
Without ANTHROPIC_API_KEY the step is skipped and the CSV is left as is.
"""
import csv, hashlib, json, os, sys, time
from concurrent.futures import ThreadPoolExecutor

MODEL = os.environ.get("VERIFY_MODEL", "claude-opus-5-5")
BATCH = 6                      # pairs per request
WORKERS = 4
DROP_CONFIDENCE = 0.6
MAX_NEW_PER_RUN = int(os.environ.get("MAX_VERIFY_PER_RUN", "300"))  # cost guard: ~$2.50 per run at most on Opus; the rest waits for the next run
RULES_CHARS = 900
CACHE_FILE = "pair_verdicts.json"
CSV_FILE = "matched_markets.csv"

SYSTEM = """You check whether two prediction markets, one on Kalshi and one on Polymarket, are the same bet.

A trader wants to buy one side on Kalshi and the opposite side on Polymarket so that exactly one of the two pays out. That only works if both markets resolve on the same real-world outcome under the same conditions. Your job is to say whether they do.

Treat the pair as DIFFERENT when any of these holds:
- They ask about different things: "most touchdowns" vs "6+ touchdowns", "#1 song" vs "#1 album", "win the award" vs "be nominated", "perform at" vs "headline", "announce a run" vs "be on the ballot", a global chart vs a US chart, second place vs winner.
- Their deadlines differ enough that the event could happen after one closes but before the other does (e.g. "before 2027" vs "before January 2029").
- One is a range and the other a threshold, or the thresholds differ.
- They use resolution sources or definitions that could plausibly disagree.

Treat the pair as SAME when, in essentially every realistic scenario, both would resolve the same way. Minor wording differences, slightly different official sources that report the same fact, or close dates with no realistic window between them are fine.

Use UNSURE when the rules are missing or too vague to tell.

Set confidence between 0 and 1 for your verdict. Write note as one sentence of at most 25 words: for DIFFERENT, name the key difference; for SAME, say "Same question" plus any caveat worth knowing; for UNSURE, say what is missing."""

SCHEMA = {
    "type": "object",
    "properties": {
        "verdicts": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "integer"},
                    "verdict": {"type": "string", "enum": ["same", "different", "unsure"]},
                    "confidence": {"type": "number"},
                    "note": {"type": "string"},
                },
                "required": ["id", "verdict", "confidence", "note"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["verdicts"],
    "additionalProperties": False,
}


def pair_key(row: dict) -> str:
    """Cache key: the two market ids plus a hash of the text the verdict depends on."""
    text = "|".join(str(row.get(k, "")) for k in
                    ("poly_question", "kalshi_question", "poly_label", "kalshi_label",
                     "poly_end_date", "kalshi_end_date", "poly_rules", "kalshi_rules"))
    return f"{row['kalshi_market_id']}|{row['poly_market_id']}|{hashlib.sha1(text.encode()).hexdigest()[:10]}"


def describe(i: int, row: dict) -> str:
    cut = lambda s: (str(s or "").strip()[:RULES_CHARS] or "(none)")
    return f"""PAIR {i}
Polymarket
  event: {row.get('poly_event','')}
  outcome: {row.get('poly_label','')}
  question: {row.get('poly_question','')}
  ends: {row.get('poly_end_date','') or 'unknown'}
  rules: {cut(row.get('poly_rules'))}
Kalshi
  event: {row.get('kalshi_event','')}
  outcome: {row.get('kalshi_label','')}
  question: {row.get('kalshi_question','')}
  expected settlement: {row.get('kalshi_end_date','') or 'unknown'}
  rules: {cut(row.get('kalshi_rules'))}"""


def judge(client, batch: list) -> dict:
    """One request for up to BATCH pairs. Returns {index: verdict dict}."""
    import anthropic
    prompt = "Judge each pair below. Return one verdict per PAIR id.\n\n" + "\n\n".join(describe(i, r) for i, r in batch)
    try:
        res = client.beta.messages.create(
            model=MODEL,
            max_tokens=4096,
            system=SYSTEM,
            messages=[{"role": "user", "content": prompt}],
            output_config={"effort": "medium", "format": {"type": "json_schema", "schema": SCHEMA}},
            # Safety classifiers can decline a request; the server reruns it on a fallback model
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )
    except anthropic.APIStatusError as e:
        print(f"  verify: API error {e.status_code}: {e.message}", file=sys.stderr)
        return {}
    except anthropic.APIConnectionError as e:
        print(f"  verify: connection error: {e}", file=sys.stderr)
        return {}
    if res.stop_reason != "end_turn":
        print(f"  verify: stop_reason {res.stop_reason}; batch marked unsure", file=sys.stderr)
        return {i: {"verdict": "unsure", "confidence": 0.0, "note": "Verification did not complete."} for i, _ in batch}
    text = next((b.text for b in res.content if b.type == "text"), "")
    try:
        out = {v["id"]: v for v in json.loads(text)["verdicts"]}
    except (ValueError, KeyError, TypeError):
        print("  verify: unparseable response", file=sys.stderr)
        return {}
    ids = {i for i, _ in batch}
    return {i: {"verdict": v["verdict"], "confidence": max(0.0, min(1.0, float(v["confidence"]))), "note": str(v["note"])[:200]}
            for i, v in out.items() if i in ids}


def main() -> None:
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("verify_pairs: ANTHROPIC_API_KEY not set — skipping LLM verification")
        return
    import anthropic
    client = anthropic.Anthropic(max_retries=4, timeout=120.0)

    with open(CSV_FILE, newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = list(reader.fieldnames or [])
        rows = list(reader)
    cache = {}
    if os.path.exists(CACHE_FILE):
        with open(CACHE_FILE) as f:
            cache = json.load(f)

    todo = [(i, r) for i, r in enumerate(rows) if pair_key(r) not in cache]
    if len(todo) > MAX_NEW_PER_RUN:
        print(f"verify_pairs: {len(todo)} new pairs, judging the first {MAX_NEW_PER_RUN} this run")
        todo = todo[:MAX_NEW_PER_RUN]
    print(f"verify_pairs: {len(rows)} pairs, {len(rows) - len(todo)} cached, {len(todo)} to judge with {MODEL}")

    batches = [todo[n:n + BATCH] for n in range(0, len(todo), BATCH)]
    started = time.time()
    with ThreadPoolExecutor(WORKERS) as ex:
        for batch, result in zip(batches, ex.map(lambda b: judge(client, b), batches)):
            for i, r in batch:
                if i in result:
                    cache[pair_key(r)] = {**result[i], "model": MODEL, "ts": int(time.time())}
    with open(CACHE_FILE, "w") as f:
        json.dump(cache, f)

    kept, dropped, counts = [], 0, {"same": 0, "different": 0, "unsure": 0, "unjudged": 0}
    for r in rows:
        v = cache.get(pair_key(r))
        if not v:
            r["llm_verdict"], r["llm_note"] = "", ""
            counts["unjudged"] += 1
            kept.append(r)
            continue
        counts[v["verdict"]] += 1
        if v["verdict"] == "different" and v["confidence"] >= DROP_CONFIDENCE:
            dropped += 1
            continue
        r["llm_verdict"], r["llm_note"] = v["verdict"], v["note"]
        kept.append(r)

    for col in ("llm_verdict", "llm_note"):
        if col not in fieldnames:
            fieldnames.append(col)
    with open(CSV_FILE, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(kept)
    print(f"verify_pairs: {counts} | dropped {dropped} | {len(kept)} pairs remain | {time.time() - started:.0f}s")


if __name__ == "__main__":
    main()
