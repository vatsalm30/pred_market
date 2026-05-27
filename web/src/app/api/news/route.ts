import { NextRequest, NextResponse } from "next/server";
import { saveStory, generateSlug, getAllStories, type NewsStory } from "@/lib/news";

export const dynamic = "force-dynamic";

function checkPassword(req: NextRequest): boolean {
  const pw = req.headers.get("x-admin-password");
  return !!process.env.ADMIN_PASSWORD && pw === process.env.ADMIN_PASSWORD;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!checkPassword(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const stories = await getAllStories();
  return NextResponse.json(stories);
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  if (!checkPassword(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { slug, headline, commentary, url, tag, date, createdAt, ogImage } = body as Record<string, string>;
  if (!slug?.trim()) return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  if (!headline?.trim() || !commentary?.trim() || !url?.trim() || !date?.trim()) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const story: NewsStory = {
    slug,
    headline: headline.trim(),
    commentary: commentary.trim(),
    url: url.trim(),
    tag: tag?.trim() || undefined,
    date: date.trim(),
    createdAt: createdAt ?? new Date().toISOString(),
    ogImage: ogImage?.trim() || undefined,
  };

  await saveStory(story);
  return NextResponse.json({ slug: story.slug });
}

async function fetchOgImage(url: string): Promise<string | undefined> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "OmniPredBot/1.0 (+https://omnipred.com)" },
    });
    clearTimeout(timeout);
    if (!res.ok) return undefined;
    const html = await res.text();
    const match = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    return match?.[1] ?? undefined;
  } catch {
    return undefined;
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!checkPassword(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { headline, commentary, url, tag, date } = body as Record<string, string>;

  if (!headline?.trim() || !commentary?.trim() || !url?.trim() || !date?.trim()) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const ogImage = await fetchOgImage(url.trim());

  const story: NewsStory = {
    slug: generateSlug(headline),
    headline: headline.trim(),
    commentary: commentary.trim(),
    url: url.trim(),
    tag: tag?.trim() || undefined,
    date: date.trim(),
    createdAt: new Date().toISOString(),
    ogImage,
  };

  await saveStory(story);
  return NextResponse.json({ slug: story.slug });
}
