"""Generate web/public/sitemap.xml from all_events.json + Upstash Redis (blog/news slugs)."""
import json, urllib.parse, urllib.request, datetime, os, sys

BASE = os.environ.get("SITE_URL", "https://omnipred.com")
TODAY = datetime.date.today().isoformat()
DATA_DIR = os.path.join("web", "public", "data")
OUT = os.path.join("web", "public", "sitemap.xml")

STATIC = [
    (BASE + "/",          "1.0", "daily"),
    (BASE + "/events",    "0.9", "hourly"),
    (BASE + "/arbitrage", "0.8", "hourly"),
    (BASE + "/alerts",    "0.7", "weekly"),
    (BASE + "/news",      "0.7", "daily"),
    (BASE + "/blog",      "0.7", "daily"),
]


def redis_zrange(key: str) -> list[str]:
    """Fetch all members of a Redis sorted set via the Upstash REST API."""
    url   = os.environ.get("UPSTASH_REDIS_REST_URL", "").rstrip("/")
    token = os.environ.get("UPSTASH_REDIS_REST_TOKEN", "")
    if not url or not token:
        return []
    endpoint = f"{url}/zrange/{urllib.parse.quote(key, safe='')}/0/-1"
    req = urllib.request.Request(endpoint, headers={"Authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
            return data.get("result") or []
    except Exception as exc:
        print(f"  warn: redis_zrange({key!r}) failed — {exc}", file=sys.stderr)
        return []


events_path = os.path.join(DATA_DIR, "all_events.json")
if not os.path.exists(events_path):
    print(f"  {events_path} not found — skipping sitemap generation", file=sys.stderr)
    sys.exit(1)

with open(events_path) as f:
    events = json.load(f)

event_ids   = list({e["id"] for e in events if e.get("id")})
blog_slugs  = redis_zrange("blog:index")
news_slugs  = redis_zrange("news:index")

lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
]

for url, priority, freq in STATIC:
    lines += [
        "  <url>",
        f"    <loc>{url}</loc>",
        f"    <lastmod>{TODAY}</lastmod>",
        f"    <changefreq>{freq}</changefreq>",
        f"    <priority>{priority}</priority>",
        "  </url>",
    ]

for slug in blog_slugs:
    lines += [
        "  <url>",
        f"    <loc>{BASE}/blog/{urllib.parse.quote(slug, safe='')}</loc>",
        f"    <lastmod>{TODAY}</lastmod>",
        "    <changefreq>monthly</changefreq>",
        "    <priority>0.6</priority>",
        "  </url>",
    ]

for slug in news_slugs:
    lines += [
        "  <url>",
        f"    <loc>{BASE}/news/{urllib.parse.quote(slug, safe='')}</loc>",
        f"    <lastmod>{TODAY}</lastmod>",
        "    <changefreq>monthly</changefreq>",
        "    <priority>0.5</priority>",
        "  </url>",
    ]

for eid in event_ids:
    slug = urllib.parse.quote(eid, safe="")
    lines += [
        "  <url>",
        f"    <loc>{BASE}/events/{slug}</loc>",
        f"    <lastmod>{TODAY}</lastmod>",
        "    <changefreq>daily</changefreq>",
        "    <priority>0.6</priority>",
        "  </url>",
    ]

lines.append("</urlset>")

with open(OUT, "w") as f:
    f.write("\n".join(lines) + "\n")

print(
    f"  sitemap.xml: {len(event_ids)} event routes"
    f" + {len(blog_slugs)} blog posts"
    f" + {len(news_slugs)} news articles"
    f" + {len(STATIC)} static routes"
    f" ({os.path.getsize(OUT):,} bytes)"
)
