import subprocess, sys, json, csv, os

def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    print(r.stdout)
    if r.returncode != 0:
        print(r.stderr); sys.exit(r.returncode)

DATA_DIR = os.path.join("web", "public", "data")
os.makedirs(DATA_DIR, exist_ok=True)

run([sys.executable, "pmxt_matcher.py"])
run([sys.executable, "arbitrage.py"])

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
