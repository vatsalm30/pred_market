import { NextRequest, NextResponse } from "next/server";
import { saveStory, generateSlug, type NewsStory } from "@/lib/news";

export const dynamic = "force-dynamic";

function checkPassword(req: NextRequest): boolean {
  const pw = req.headers.get("x-admin-password");
  return !!process.env.ADMIN_PASSWORD && pw === process.env.ADMIN_PASSWORD;
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

  const story: NewsStory = {
    slug: generateSlug(headline),
    headline: headline.trim(),
    commentary: commentary.trim(),
    url: url.trim(),
    tag: tag?.trim() || undefined,
    date: date.trim(),
    createdAt: new Date().toISOString(),
  };

  await saveStory(story);
  return NextResponse.json({ slug: story.slug });
}
