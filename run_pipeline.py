import subprocess, sys, json, csv, os, time

def run_with_retry(cmd, retries=3, backoff=90):
    for attempt in range(retries):
        r = subprocess.run(cmd, capture_output=True, text=True)
        print(r.stdout)
        if r.returncode == 0:
            return
        print(r.stderr)
        # Retry on rate limit (429 surfaces as non-zero exit)
        if attempt < retries - 1 and ("429" in r.stderr or "too many requests" in r.stderr.lower() or "RateLimitExceeded" in r.stderr):
            wait = backoff * (attempt + 1)
            print(f"Rate limited. Waiting {wait}s before retry {attempt + 2}/{retries}...")
            time.sleep(wait)
        else:
            sys.exit(r.returncode)

DATA_DIR = os.path.join("web", "public", "data")
os.makedirs(DATA_DIR, exist_ok=True)

run_with_retry([sys.executable, "pmxt_matcher.py"])
run_with_retry([sys.executable, "matcher.py"])
run_with_retry([sys.executable, "arbitrage.py"])

def csv_to_json(src, dst, numeric_fields):
    rows = []
    with open(src) as f:
        for row in csv.DictReader(f):
            for field in numeric_fields:
                if field in row and row[field] != "":
                    row[field] = float(row[field])
            rows.append(row)
    with open(os.path.join(DATA_DIR, dst), "w") as f:
        json.dump(rows, f)
    print(f"  {dst}: {len(rows)} rows")

csv_to_json("matched_markets.csv", "matched_markets.json",
    ["event_score", "outcome_score"])
csv_to_json("arbitrage_opportunities.csv", "arbitrage_opportunities.json",
    ["event_score", "outcome_score", "kalshi_ask", "poly_ask",
     "gross_cost", "gross_spread", "net_profit_pct"])
