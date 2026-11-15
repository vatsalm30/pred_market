import { NextRequest, NextResponse } from "next/server";
import { putIfAbsent, nowSec } from "@/lib/db";
import { getAllStories, saveStory, generateSlug as newsSlug, type NewsStory } from "@/lib/news";
import { getAllPosts, saveBlogPost, generateSlug as blogSlug, type BlogPost } from "@/lib/blog";

export const dynamic = "force-dynamic";

// The daily content job (gcp/pipeline/generate_content.py) writes news stories and blog posts here.
// GET  ?date=YYYY-MM-DD  -> what already exists, so the job can avoid repeats and count today's items
// POST { kind, date, slot, items } -> validate and store; each (kind, date, slot) is accepted once
const NEWS_TAGS = ["Elections", "Regulation", "Market Data", "Kalshi", "Polymarket", "Sports", "Crypto", "Economy"];
const DAY = 86_400;

const authorized = (req: NextRequest) =>
  !!process.env.CRON_SECRET && req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;

const str = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim().length > 0 && v.length <= max ? v.trim() : null;

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!authorized(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const date = req.nextUrl.searchParams.get("date") ?? "";
  if (!/^\d{4}-\d\d-\d\d$/.test(date)) return NextResponse.json({ error: "Bad date" }, { status: 400 });
  const [stories, posts] = await Promise.all([getAllStories(), getAllPosts()]);
  return NextResponse.json({
    news_today: stories.filter((s) => s.date === date).length,
    blog_today: posts.filter((p) => p.date === date).length,
    news_urls: stories.slice(0, 300).map((s) => s.url),
    news_headlines: stories.slice(0, 20).map((s) => s.headline),
    blog_titles: posts.slice(0, 25).map((p) => p.title),
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!authorized(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { kind?: string; date?: string; slot?: number; items?: unknown[] } | null;
  const { kind, date, slot } = body ?? {};
  if ((kind !== "news" && kind !== "blog") || !/^\d{4}-\d\d-\d\d$/.test(date ?? "") || !Number.isInteger(slot) || !Array.isArray(body?.items)) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const items = body.items.slice(0, 3);
  if (!items.length) return NextResponse.json({ ok: true, saved: 0 });

  // Validate everything before taking the slot, so a bad payload can be fixed and resent
  const stories: NewsStory[] = [];
  const posts: BlogPost[] = [];
  for (const raw of items as Record<string, unknown>[]) {
    if (kind === "news") {
      const url = str(raw.url, 600);
      const headline = str(raw.headline, 220);
      const commentary = str(raw.commentary, 1500);
      const tag = typeof raw.tag === "string" && NEWS_TAGS.includes(raw.tag) ? raw.tag : null;
      if (!url?.startsWith("https://") || !headline || !commentary || !tag) return NextResponse.json({ error: "Bad story" }, { status: 400 });
      const ogImage = typeof raw.ogImage === "string" && raw.ogImage.startsWith("https://") && raw.ogImage.length < 600 ? raw.ogImage : undefined;
      stories.push({ slug: newsSlug(headline), headline, commentary, url, tag, date: date!, createdAt: new Date().toISOString(), ogImage });
    } else {
      const title = str(raw.title, 200);
      const metaTitle = str(raw.metaTitle, 120);
      const metaDescription = str(raw.metaDescription, 320);
      const text = str(raw.body, 12000);
      const tags = Array.isArray(raw.tags) ? raw.tags.map((t) => str(t, 30)).filter((t): t is string => !!t).slice(0, 5) : [];
      const table = Array.isArray(raw.table)
        ? (raw.table as Record<string, unknown>[]).slice(0, 8).map((r) => ({
            market: str(r.market, 120) ?? "", polyPrice: str(r.polyPrice, 40) ?? "", kalshiPrice: str(r.kalshiPrice, 40) ?? "",
            gapPct: str(r.gapPct, 40) ?? "", net500: str(r.net500, 40) ?? "",
          }))
        : [];
      if (!title || !metaTitle || !metaDescription || !text || !tags.length) return NextResponse.json({ error: "Bad post" }, { status: 400 });
      posts.push({ title, slug: blogSlug(title), metaTitle, metaDescription, body: text, table, tags, date: date! });
    }
  }

  const claimed = await putIfAbsent({ pk: `content#${kind}`, sk: `${date}#${slot}`, ttl: nowSec() + 3 * DAY });
  if (!claimed) return NextResponse.json({ ok: true, skipped: "slot already filled" });
  for (const s of stories) await saveStory(s);
  for (const p of posts) await saveBlogPost(p);
  return NextResponse.json({ ok: true, saved: stories.length + posts.length, slugs: [...stories, ...posts].map((x) => x.slug) });
}
