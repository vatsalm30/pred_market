"""Generate web/public/sitemap.xml from web/public/data/all_events.json."""
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
]

events_path = os.path.join(DATA_DIR, "all_events.json")
if not os.path.exists(events_path):
    print(f"  {events_path} not found — skipping sitemap generation", file=sys.stderr)
    sys.exit(1)

with open(events_path) as f:
    events = json.load(f)

ids = list({e["id"] for e in events if e.get("id")})

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

for eid in ids:
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

print(f"  sitemap.xml: {len(ids)} event routes + {len(STATIC)} static routes ({os.path.getsize(OUT):,} bytes)")
