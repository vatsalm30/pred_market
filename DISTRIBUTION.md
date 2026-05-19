# Deployment + Live Data Plan

## Context

Both matched markets and prices need to stay fresh. The primary pipeline is a 30-minute
GitHub Actions cron that runs the Python matching + arbitrage scripts and commits JSON to
the repo, triggering a Vercel redeploy. The user also wants to explore using the Kalshi
and Polymarket WebSocket APIs for live price streaming on the frontend.

---

## Part 1 — 30-minute pipeline (primary, no extra infra)

### Architecture

```
Every 30 min — GitHub Actions cron:
  1. python pmxt_matcher.py   → matched_markets.json
  2. python arbitrage.py      → arbitrage_opportunities.json  (includes live ask prices)
  3. git commit + push        → Vercel redeploys (~60 sec, serves fresh JSON)

Browser reads /data/matched_markets.json + /data/arbitrage_opportunities.json
```

48 deploys/day < Vercel Hobby limit of 100/day. ✓

### Cost

| Service | Cost |
|---------|------|
| Vercel (site) | $0 |
| GitHub Actions (public repo) | $0 |
| GitHub Actions (private repo) | ~$30/mo — make repo public to avoid this |

### Files to create

**`pred_market/run_pipeline.py`**

```python
import subprocess, sys, json, csv, os

def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    print(r.stdout)
    if r.returncode != 0:
        print(r.stderr); sys.exit(r.returncode)

DATA_DIR = os.path.join("web", "public", "data")

run([sys.executable, "pmxt_matcher.py"])
run([sys.executable, "arbitrage.py"])

def csv_to_json(src, dst, numeric_fields):
    rows = []
    with open(src) as f:
        for row in csv.DictReader(f):
            for field in numeric_fields:
                if field in row: row[field] = float(row[field])
            rows.append(row)
    with open(os.path.join(DATA_DIR, dst), "w") as f:
        json.dump(rows, f)
    print(f"  {dst}: {len(rows)} rows")

csv_to_json("matched_markets.csv", "matched_markets.json", ["event_score", "outcome_score"])
csv_to_json("arbitrage_opportunities.csv", "arbitrage_opportunities.json",
    ["event_score", "outcome_score", "kalshi_ask", "poly_ask",
     "gross_cost", "gross_spread", "net_profit_pct"])
```

**`.github/workflows/refresh-data.yml`**

```yaml
name: Refresh market data
on:
  schedule:
    - cron: '*/30 * * * *'
  workflow_dispatch:
jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { token: '${{ secrets.GITHUB_TOKEN }}' }
      - uses: actions/setup-python@v5
        with: { python-version: '3.11', cache: 'pip' }
      - run: pip install -r requirements.txt
        working-directory: pred_market
      - name: Run pipeline
        env: { KALSHI_API_KEY: '${{ secrets.KALSHI_API_KEY }}' }
        run: python run_pipeline.py
        working-directory: pred_market
      - name: Commit
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add web/public/data/matched_markets.json \
                  web/public/data/arbitrage_opportunities.json
          git diff --staged --quiet || git commit -m "chore: refresh market data [skip ci]"
          git push
```

`[skip ci]` stops GitHub Actions from re-triggering on its own commit.
Vercel ignores `[skip ci]` and still deploys — which is what we want.

### File to modify

**`web/src/lib/csv.ts`** — swap `.csv` fetches for `.json`, drop the custom CSV parser:

```typescript
export async function fetchMatchedMarkets(): Promise<GroupedMarket[]> {
  const [rows, arb]: [MatchedMarket[], ArbitrageOpportunity[]] = await Promise.all([
    fetch("/data/matched_markets.json").then(r => r.json()),
    fetch("/data/arbitrage_opportunities.json").then(r => r.json()),
  ]);
  const urlMap: Record<string, {poly_url: string; kalshi_url: string}> = {};
  for (const o of arb) {
    if (!urlMap[o.poly_event]) urlMap[o.poly_event] = {poly_url: o.poly_url, kalshi_url: o.kalshi_url};
  }
  const grouped: Record<string, GroupedMarket> = {};
  for (const row of rows) {
    if (!grouped[row.poly_event]) grouped[row.poly_event] = {
      poly_event: row.poly_event, kalshi_event: row.kalshi_event,
      event_score: row.event_score, outcomes: [],
      poly_url: urlMap[row.poly_event]?.poly_url ?? null,
      kalshi_url: urlMap[row.poly_event]?.kalshi_url ?? null,
    };
    grouped[row.poly_event].outcomes.push(row);
  }
  return Object.values(grouped).sort((a, b) => b.event_score - a.event_score);
}

export async function fetchArbitrageOpportunities(): Promise<ArbitrageOpportunity[]> {
  return fetch("/data/arbitrage_opportunities.json").then(r => r.json());
}
```

Everything else in `csv.ts` (interfaces, `categoryFromEvent`, etc.) stays the same.

---

## Part 2 — WebSocket live prices (enhancement, requires a persistent server)

### What the research found

| | Kalshi WS | Polymarket RTDS |
|---|---|---|
| **Endpoint** | `wss://external-api-ws.kalshi.com/trade-api/ws/v2` | `wss://ws-live-data.polymarket.com` |
| **Auth** | RSA-PSS signed headers (private key required) | None for public feeds |
| **Streams market prices?** | YES — ticker channel streams YES/NO ask prices per market | NO — streams crypto/equity reference data (BTC, stocks), NOT prediction market prices |
| **Browser direct?** | NO — private key cannot be in the browser | N/A — wrong data |

**Bottom line:**
- Kalshi WS gives exactly what we want (live YES/NO prices) but requires a private RSA
  key for authentication — it cannot be opened directly from the browser
- Polymarket's RTDS WebSocket does not stream prediction market prices at all; it's for
  reference asset feeds (BTC/USD etc.)
- For Polymarket prediction market prices, the REST CLOB API
  (`https://clob.polymarket.com/price?token_id=...`) is the right tool — it's public,
  no auth needed, and can be polled from the frontend

### Architecture if you want live prices

```
Persistent proxy server (Railway / Fly.io, ~$5/mo):
  - Holds Kalshi RSA private key securely
  - Opens authenticated Kalshi WS connection
  - Forwards ticker messages to browser clients via a second WS endpoint
  
Browser:
  - Connects to YOUR proxy WS (no auth, no private key exposure)
  - Receives live Kalshi price updates
  - Polls Polymarket CLOB REST API directly (no auth needed)
```

### Why Vercel can't host this

Vercel serverless functions have a max execution time of 10–60 seconds and do not support
persistent WebSocket server connections. A small always-on process is needed.

**Cheapest options for the proxy server:**
- Fly.io free tier (shared CPU, adequate for a WS proxy)
- Railway ($5/month Hobby plan)
- Render (free tier, but sleeps after 15 min inactivity — not suitable)

### Files needed for the WS proxy (future, not in initial implementation)

- `ws-proxy/index.ts` — Node.js server that authenticates to Kalshi WS (RSA signing)
  and re-exposes messages at `wss://your-proxy.fly.dev/kalshi`
- `web/src/hooks/useLivePrices.ts` — React hook that connects to the proxy and
  updates price state in real-time, overlaying the 30-min snapshot data
- Deployment config for Fly.io or Railway

**Prerequisite:** Kalshi RSA private key (separate from the API key used in `arbitrage.py`)

---

## Recommended rollout

1. **Start with Part 1** — deploy the site, get the 30-min pipeline running. This gives
   fresh data without any extra infrastructure.
2. **Add Part 2 later** if 30-minute staleness is a problem. The two approaches stack
   cleanly: 30-min cron handles match list + base snapshot; WS proxy overlays live
   prices on top.

---

## Vercel deployment steps

1. Push repo to GitHub (public recommended)
2. vercel.com → New Project → import repo → Root Directory: `web` → Deploy
3. GitHub → Settings → Secrets → Actions → add `KALSHI_API_KEY`
4. Run `python run_pipeline.py` locally to generate initial JSON → commit → push
5. GitHub Actions → "Refresh market data" → "Run workflow" → verify it runs

---

## Verification

1. `python run_pipeline.py` locally → JSON files created in `web/public/data/`
2. `cd web && npm run dev` → `/markets` and `/arbitrage` load from JSON, no CSV parser
3. GitHub Actions manual trigger → new commit appears, Vercel redeploys
4. 30 minutes later → second automatic commit, prices updated