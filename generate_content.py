"""Daily content job: 3 news stories and 3 blog posts a day, one of each in each of three slots.

Runs on GCP three times a day (13:00, 17:00 and 21:00 UTC). Each run:
  - news:  finds recent prediction-market articles, has Claude pick the ones that matter and
           write a short factual take, and publishes them with a link to the source
  - blog:  writes one data-driven post from the site's live data. The topic rotates by slot:
           slot 0 best verified arbitrage gaps, slot 1 Kalshi-vs-Polymarket odds on the most
           traded matched event, slot 2 biggest 24h movers (falls back to a second event)
The job only does the thinking; the site stores the result via POST /api/content, which also
makes each (kind, date, slot) idempotent, so a retry can't double-post.

Env: ANTHROPIC_API_KEY, CONTENT_SECRET (the site's CRON_SECRET), SITE_URL (default omnipred.com),
     CONTENT_MODEL (default claude-opus-5-5), CONTENT_SLOT (override the slot picked from the clock).
Flags: --dry-run prints what would be published and doesn't contact the site's write endpoint.
"""
import json, os, re, sys, urllib.parse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

import requests

SITE = os.environ.get("SITE_URL", "https://www.omnipred.com").rstrip("/")
SECRET = os.environ.get("CONTENT_SECRET", "")
MODEL = os.environ.get("CONTENT_MODEL", "claude-opus-5-5")
DRY = "--dry-run" in sys.argv
UA = {"User-Agent": "OmniPredBot/1.0 (+https://www.omnipred.com)"}
NEWS_TAGS = ["Elections", "Regulation", "Market Data", "Kalshi", "Polymarket", "Sports", "Crypto", "Economy"]
KALSHI_FEE, POLY_FEE = 0.07, 0.05  # same estimate as the site (web/src/lib/fees.ts)

NEWS_SYSTEM = (
    "You curate news for OmniPred, a site that tracks price gaps between Kalshi and Polymarket. "
    "Write like a trader talking to traders: data-forward, no hype, no filler. "
    "Only state facts that appear in the article titles and summaries you are given, and attribute them "
    "to the outlet (e.g. \"Reuters reports...\"). Never invent numbers, quotes, dates or outcomes."
)
BLOG_SYSTEM = (
    "You write posts for OmniPred, a site that compares Kalshi and Polymarket prices and finds gaps between them. "
    "Write like a trader talking to traders: data-forward, plain English, no hype and no filler. "
    "Use only the numbers and facts in the data you are given; never invent figures, quotes or events. "
    "Gaps are before fees unless the data says otherwise, they close quickly, and they are not risk-free: "
    "mention the relevant risks (fees, thin order books, differing resolution rules or dates) where they apply. "
    "Format the body as paragraphs separated by blank lines, with a few '## ' subheadings. About 350-500 words."
)

NEWS_SCHEMA = {
    "type": "object",
    "properties": {"stories": {"type": "array", "items": {
        "type": "object",
        "properties": {"index": {"type": "integer"}, "headline": {"type": "string"},
                       "commentary": {"type": "string"}, "tag": {"type": "string", "enum": NEWS_TAGS}},
        "required": ["index", "headline", "commentary", "tag"], "additionalProperties": False}}},
    "required": ["stories"], "additionalProperties": False,
}
BLOG_SCHEMA = {
    "type": "object",
    "properties": {"title": {"type": "string"}, "metaTitle": {"type": "string"}, "metaDescription": {"type": "string"},
                   "body": {"type": "string"}, "tags": {"type": "array", "items": {"type": "string"}}},
    "required": ["title", "metaTitle", "metaDescription", "body", "tags"], "additionalProperties": False,
}


# ── Claude ───────────────────────────────────────────────────────────────────

def ask(system: str, prompt: str, schema: dict, max_tokens: int = 8000) -> dict:
    import anthropic
    client = anthropic.Anthropic(max_retries=4, timeout=180.0)
    res = client.beta.messages.create(
        model=MODEL, max_tokens=max_tokens, system=system,
        messages=[{"role": "user", "content": prompt}],
        output_config={"effort": "medium", "format": {"type": "json_schema", "schema": schema}},
        # Safety classifiers can decline a request; the server reruns it on a fallback model
        betas=["server-side-fallback-2026-07-01"], fallbacks="default",
    )
    if res.stop_reason != "end_turn":
        raise RuntimeError(f"stop_reason {res.stop_reason}")
    return json.loads(next(b.text for b in res.content if b.type == "text"))


# ── Site ─────────────────────────────────────────────────────────────────────

def site_get(path: str):
    r = requests.get(f"{SITE}{path}", headers={**UA, "Authorization": f"Bearer {SECRET}"}, timeout=30)
    r.raise_for_status()
    return r.json()


def context(date: str) -> dict:
    empty = {"news_today": 0, "blog_today": 0, "news_urls": [], "news_headlines": [], "blog_titles": []}
    if not SECRET:
        return empty
    try:
        return site_get(f"/api/content?date={date}")
    except requests.RequestException as e:
        print(f"content: couldn't load context ({e}); continuing without it", file=sys.stderr)
        return empty


def publish(kind: str, date: str, slot: int, items: list) -> None:
    if not items:
        print(f"content: no {kind} to publish")
        return
    if DRY:
        print(f"\n=== DRY RUN: {kind} ({len(items)}) ===\n{json.dumps(items, indent=2, ensure_ascii=False)}")
        return
    r = requests.post(f"{SITE}/api/content", json={"kind": kind, "date": date, "slot": slot, "items": items},
                      headers={**UA, "Authorization": f"Bearer {SECRET}"}, timeout=60)
    r.raise_for_status()
    print(f"content: {kind} -> {r.json()}")


# ── News ─────────────────────────────────────────────────────────────────────

FEED = ("https://news.google.com/rss/search?q=" +
        urllib.parse.quote('Kalshi OR Polymarket OR "prediction market" when:1d') + "&hl=en-US&gl=US&ceid=US:en")
unescape = lambda s: s.replace("&amp;", "&").replace("&quot;", '"').replace("&#39;", "'").replace("&lt;", "<").replace("&gt;", ">")


def resolve_google_news(link: str):
    """Google News RSS links point at news.google.com; resolve them to the publisher's URL."""
    aid = link.split("/articles/")[1].split("?")[0] if "/articles/" in link else None
    if not aid:
        return None
    page = requests.get(f"https://news.google.com/rss/articles/{aid}", headers=UA, timeout=15).text
    sig = re.search(r'data-n-a-sg="([^"]+)"', page)
    ts = re.search(r'data-n-a-ts="([^"]+)"', page)
    if not sig or not ts:
        return None
    inner = json.dumps(["garturlreq", [["X", "X", ["X", "X"], None, None, 1, 1, "US:en", None, 1, None, None, None, None, None, 0, 1],
                                       "X", "X", 1, [1, 1, 1], 1, 1, None, 0, 0, None, 0], aid, int(ts.group(1)), sig.group(1)])
    res = requests.post("https://news.google.com/_/DotsSplashUi/data/batchexecute",
                        data="f.req=" + urllib.parse.quote(json.dumps([[["Fbv4je", inner, None, "generic"]]])),
                        headers={**UA, "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"}, timeout=15)
    m = re.search(r'garturlres\\",\\"(https?:[^\\"]+)', res.text)
    return m.group(1) if m else None


def meta(html: str, prop: str):
    m = (re.search(rf'<meta[^>]+(?:property|name)=["\']{prop}["\'][^>]+content=["\']([^"\']+)', html, re.I)
         or re.search(rf'<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name)=["\']{prop}["\']', html, re.I))
    return unescape(m.group(1)) if m else None


def candidate(item: dict, seen: set):
    try:
        url = resolve_google_news(item["link"])
    except requests.RequestException:
        return None
    if not url or url in seen or not url.startswith("https://"):
        return None
    out = {**item, "url": url, "description": None, "ogImage": None}
    try:
        html = requests.get(url, headers=UA, timeout=6).text[:200_000]
        out["description"] = meta(html, "og:description") or meta(html, "description")
        out["ogImage"] = meta(html, "og:image")
    except requests.RequestException:
        pass  # many publishers block bots; the title alone is still usable
    return out


def run_news(date: str, slot: int, ctx: dict) -> None:
    wanted = min(2, slot + 1 - ctx["news_today"])  # 3 a day: one per slot, catching up if one was missed
    if wanted <= 0:
        print(f"content: news already has {ctx['news_today']} today, slot {slot} skipped")
        return
    xml = requests.get(FEED, headers=UA, timeout=30).text
    items = []
    for body in re.findall(r"<item>([\s\S]*?)</item>", xml)[:12]:
        source = unescape((re.search(r"<source[^>]*>([^<]*)</source>", body) or [None, ""])[1])
        title = unescape((re.search(r"<title>([^<]*)</title>", body) or [None, ""])[1]).replace(f" - {source}", "")
        link = (re.search(r"<link>([^<]+)</link>", body) or [None, ""])[1]
        if title and link:
            items.append({"title": title, "source": source, "link": link})
    seen = set(ctx["news_urls"])
    with ThreadPoolExecutor(6) as ex:
        cands = [c for c in ex.map(lambda i: candidate(i, seen), items) if c]
    if not cands:
        print("content: no fresh news candidates")
        return
    listing = "\n".join(f"{i}. [{c['source']}] {c['title']}" + (f"\n   Summary: {c['description']}" if c["description"] else "")
                        for i, c in enumerate(cands))
    prompt = (f"Today is {date}.\n\nArticles from the last day:\n{listing}\n\n"
              f"Headlines we already published (skip the same stories):\n" +
              ("\n".join(f"- {h}" for h in ctx["news_headlines"]) or "(none)") + "\n\n"
              f"Pick up to {wanted} article(s) that matter most to people trading on Kalshi or Polymarket (regulation, volumes, "
              "notable market moves, platform news). Skip duplicates of each other, listicles, promos, and anything not really about "
              "prediction markets. Return an empty list if nothing qualifies.\nFor each pick: the index from the list, a rewritten "
              "factual headline (not the original wording), and 2-4 sentences of commentary in one paragraph: what the article reports, "
              "then why it matters for traders.")
    stories = []
    for pick in ask(NEWS_SYSTEM, prompt, NEWS_SCHEMA, 4000)["stories"][:wanted]:
        if not 0 <= pick["index"] < len(cands):
            continue
        c = cands[pick["index"]]
        stories.append({"headline": pick["headline"].strip(), "commentary": pick["commentary"].strip(), "tag": pick["tag"],
                        "url": c["url"], "ogImage": c["ogImage"]})
    publish("news", date, slot, stories)


# ── Blog ─────────────────────────────────────────────────────────────────────

def net_after_fees_pct(k: float, p: float) -> float:
    cost = k + p + KALSHI_FEE * k * (1 - k) + POLY_FEE * p * (1 - p)
    return (1 - cost) / cost * 100


def fetch_json(path: str):
    r = requests.get(f"{SITE}{path}", headers=UA, timeout=60)
    r.raise_for_status()
    return r.json()


def blog_arbs(date: str, ctx: dict) -> dict:
    arbs = [o for o in fetch_json("/data/arbitrage_opportunities.json")
            if not o.get("suspect") and o.get("llm_verdict") in ("same", "", None)]
    arbs.sort(key=lambda o: -net_after_fees_pct(o["kalshi_ask"], o["poly_ask"]))
    top = arbs[:5]
    if not top:
        raise RuntimeError("no verified arbitrage gaps right now")
    rows, table = [], []
    for i, o in enumerate(top, 1):
        net = net_after_fees_pct(o["kalshi_ask"], o["poly_ask"])
        rows.append(f"{i}. {o['poly_event']} / {o['poly_label']}\n"
                    f"   Kalshi {o['kalshi_leg']} @ {o['kalshi_ask']*100:.1f}c | Polymarket {o['poly_leg']} @ {o['poly_ask']*100:.1f}c\n"
                    f"   Gap before fees: {o['net_profit_pct']:.2f}% | about {net:.2f}% after estimated fees\n"
                    f"   Settles: Polymarket {o.get('poly_end_date') or '?'}, Kalshi {o.get('kalshi_end_date') or '?'} | "
                    f"Volume: Polymarket event total ${o.get('poly_volume', 0):,.0f}, this Kalshi market ${o.get('kalshi_volume', 0):,.0f}\n"
                    f"   Automated check: {o.get('llm_note') or 'not available'}")
        table.append({"market": f"{o['poly_label']} ({o['poly_event']})"[:110], "polyPrice": f"{o['poly_ask']*100:.1f}¢ {o['poly_leg']}",
                      "kalshiPrice": f"{o['kalshi_ask']*100:.1f}¢ {o['kalshi_leg']}", "gapPct": f"{o['net_profit_pct']:.1f}%",
                      "net500": f"${net/100*500:.0f}"})
    prompt = (f"Today is {date}.\n\nThe best verified Kalshi-vs-Polymarket gaps right now, ranked by profit after estimated fees "
              f"(Kalshi 7% x P x (1-P) and Polymarket about 5% x P x (1-P) per contract):\n\n" + "\n\n".join(rows) +
              "\n\nWrite a market-movements post. Lead with the best gap and put its numbers in the title. Cover the top 3 in the body: "
              "what each position is, what it pays, and what could go wrong (different resolution rules or dates, thin books, fees). "
              "Mention that the table shows the gap before fees and the estimated profit on $500 after fees.\n"
              f"Posts we already published (don't repeat their angle):\n" + "\n".join(f"- {t}" for t in ctx["blog_titles"][:10]))
    return {"prompt": prompt, "table": table, "tags": ["Arbitrage", "Market Movements"]}


def matched_events() -> list:
    rows = fetch_json("/data/matched_markets.json")
    by = {}
    for r in rows:
        e = by.setdefault(r["poly_event"], {"event": r["poly_event"], "poly_volume": 0, "kalshi_volume": 0, "outcomes": []})
        # poly_volume is the whole Polymarket event's volume, repeated on every outcome row; Kalshi's is per market
        e["poly_volume"] = max(e["poly_volume"], r.get("poly_volume") or 0)
        e["kalshi_volume"] += r.get("kalshi_volume") or 0
        e["outcomes"].append(r)
    for e in by.values():
        e["volume"] = e["poly_volume"] + e["kalshi_volume"]
    return sorted(by.values(), key=lambda e: -e["volume"])


def event_prompt(ev: dict, date: str, ctx: dict) -> dict:
    outs = sorted(ev["outcomes"], key=lambda r: -(r.get("poly_yes_ask") or r.get("kalshi_yes_ask") or 0))[:6]
    lines = []
    for r in outs:
        p, k = r.get("poly_yes_ask"), r.get("kalshi_yes_ask")
        if p is None or k is None:
            continue
        lines.append(f"- {r['poly_label']}: Polymarket YES {p*100:.1f}c, Kalshi YES {k*100:.1f}c (difference {abs(p-k)*100:.1f} points); "
                     f"settles Polymarket {r.get('poly_end_date') or '?'}, Kalshi {r.get('kalshi_end_date') or '?'}")
    prompt = (f"Today is {date}.\n\nEvent: {ev['event']}\nTrading volume: Polymarket event total ${ev['poly_volume']:,.0f}, Kalshi markets listed here ${ev['kalshi_volume']:,.0f}\n"
              f"Prices for the leading outcomes on each venue (YES asks):\n" + "\n".join(lines) + "\n\n"
              "Write a post comparing how Kalshi and Polymarket price this event. Explain what the market implies, where the venues agree "
              "and disagree, what could explain a difference (user base, fees, rules wording or dates), and what a trader should check "
              "before acting on it. Include the numbers above in the text.\n"
              f"Posts we already published (don't repeat their angle):\n" + "\n".join(f"- {t}" for t in ctx["blog_titles"][:10]))
    return {"prompt": prompt, "table": [], "tags": ["Odds Comparison", "Kalshi", "Polymarket"]}


def blog_event(date: str, ctx: dict, skip: int = 0) -> dict:
    titles = " ".join(ctx["blog_titles"]).lower()
    fresh = [e for e in matched_events() if len(e["outcomes"]) >= 2 and e["event"].lower()[:30] not in titles]
    if len(fresh) <= skip:
        raise RuntimeError("no matched event left to write about")
    return event_prompt(fresh[skip], date, ctx)


def blog_movers(date: str, ctx: dict) -> dict:
    movers = fetch_json("/api/movers").get("movers", [])[:8]
    if len(movers) < 3:
        return blog_event(date, ctx, skip=1)  # history not deep enough yet
    lines = [f"- {m['label']} ({m['event']}): {m['from']*100:.0f}% to {m['to']*100:.0f}% ({m['change']:+.1f} points)" for m in movers]
    prompt = (f"Today is {date}.\n\nMarkets listed on both Kalshi and Polymarket whose implied probability (average of the two venues) "
              "moved most in the last 24 hours:\n" + "\n".join(lines) + "\n\n"
              "Write a post on the day's biggest movers. Group them by theme, say what the move implies, and be clear that we only see the "
              "price change and not the cause, so offer possible explanations as possibilities. End with what to watch next.\n"
              f"Posts we already published (don't repeat their angle):\n" + "\n".join(f"- {t}" for t in ctx["blog_titles"][:10]))
    return {"prompt": prompt, "table": [], "tags": ["Market Movers", "Daily Recap"]}


def run_blog(date: str, slot: int, ctx: dict) -> None:
    if ctx["blog_today"] >= slot + 1:
        print(f"content: blog already has {ctx['blog_today']} today, slot {slot} skipped")
        return
    plan = [blog_arbs, lambda d, c: blog_event(d, c), blog_movers][slot](date, ctx)
    post = ask(BLOG_SYSTEM, plan["prompt"], BLOG_SCHEMA)
    tags, seen = [], set()
    for t in plan["tags"][:1] + [t.strip() for t in post["tags"] if t.strip()]:
        if t.lower() not in seen:  # "Arbitrage" and "arbitrage" are the same tag
            seen.add(t.lower())
            tags.append(t)
    publish("blog", date, slot, [{"title": post["title"].strip(), "metaTitle": post["metaTitle"].strip(),
                                  "metaDescription": post["metaDescription"].strip(), "body": post["body"].strip(),
                                  "tags": tags[:4], "table": plan["table"]}])


def main() -> int:
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("content: ANTHROPIC_API_KEY not set, nothing to do")
        return 0
    if not SECRET and not DRY:
        print("content: CONTENT_SECRET not set, can't publish", file=sys.stderr)
        return 1
    now = datetime.now(timezone.utc)
    date = now.strftime("%Y-%m-%d")
    slot = int(os.environ["CONTENT_SLOT"]) if os.environ.get("CONTENT_SLOT") else (0 if now.hour < 15 else 1 if now.hour < 19 else 2)
    print(f"content: {date} slot {slot} with {MODEL}{' (dry run)' if DRY else ''}")
    ctx = context(date)
    failures = 0
    for name, fn in (("news", run_news), ("blog", run_blog)):
        try:
            fn(date, slot, ctx)
        except Exception as e:  # one half failing shouldn't lose the other
            failures += 1
            print(f"content: {name} failed: {type(e).__name__}: {e}", file=sys.stderr)
    return 1 if failures == 2 else 0


if __name__ == "__main__":
    sys.exit(main())
