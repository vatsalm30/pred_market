"""Generate web/public/sitemap.xml from all_events.json + DynamoDB (blog/news slugs)."""
import json, urllib.parse, datetime, os, sys

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


def post_slugs(kind: str) -> list[str]:
    """Slugs in a blog/news partition of the DynamoDB table, newest first."""
    table_name = os.environ.get("DYNAMODB_TABLE")
    if not table_name:
        return []
    try:
        import boto3
        from boto3.dynamodb.conditions import Key

        table = boto3.resource("dynamodb").Table(table_name)
        items, kwargs = [], {"KeyConditionExpression": Key("pk").eq(kind)}
        while True:
            resp = table.query(**kwargs)
            items += resp["Items"]
            if "LastEvaluatedKey" not in resp:
                break
            kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]
        items.sort(key=lambda i: i.get("score", 0), reverse=True)
        return [i["sk"] for i in items]
    except Exception as exc:
        print(f"  warn: post_slugs({kind!r}) failed — {exc}", file=sys.stderr)
        return []


events_path = os.path.join(DATA_DIR, "all_events.json")
if not os.path.exists(events_path):
    print(f"  {events_path} not found — skipping sitemap generation", file=sys.stderr)
    sys.exit(1)

with open(events_path) as f:
    events = json.load(f)

event_ids   = list({e["id"] for e in events if e.get("id")})
blog_slugs  = post_slugs("blog")
news_slugs  = post_slugs("news")

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
