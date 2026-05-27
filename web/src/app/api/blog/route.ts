import { NextRequest, NextResponse } from "next/server";
import { saveBlogPost, generateSlug, getAllPosts, type BlogPost } from "@/lib/blog";

export const dynamic = "force-dynamic";

function checkPassword(req: NextRequest): boolean {
  const pw = req.headers.get("x-admin-password");
  return !!process.env.ADMIN_PASSWORD && pw === process.env.ADMIN_PASSWORD;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!checkPassword(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const posts = await getAllPosts();
  return NextResponse.json(posts);
}

function buildPost(body: Record<string, unknown>, slug: string): BlogPost | { error: string } {
  const { title, body: postBody, tags, metaTitle, metaDescription, table, date, ogImage } = body as Record<string, string>;
  if (!title?.trim() || !postBody?.trim() || !date?.trim()) {
    return { error: "Missing required fields: title, body, date" };
  }

  let parsedTags: string[] = [];
  if (typeof tags === "string") {
    parsedTags = tags.split(",").map((t) => t.trim()).filter(Boolean);
  } else if (Array.isArray(tags)) {
    parsedTags = tags;
  }

  let parsedTable: BlogPost["table"] = [];
  if (table) {
    try {
      parsedTable = JSON.parse(typeof table === "string" ? table : JSON.stringify(table));
    } catch {
      return { error: "Invalid JSON in table field" };
    }
  }

  return {
    slug,
    title: title.trim(),
    metaTitle: (metaTitle?.trim() || title.trim()).slice(0, 80),
    metaDescription: metaDescription?.trim() || postBody.trim().split(".")[0] + ".",
    body: postBody.trim(),
    table: parsedTable,
    tags: parsedTags,
    date: date.trim(),
    ogImage: ogImage?.trim() || undefined,
  };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!checkPassword(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const slug = generateSlug((body as Record<string, string>).title ?? "");
  const post = buildPost(body, slug);
  if ("error" in post) return NextResponse.json({ error: post.error }, { status: 400 });

  await saveBlogPost(post);
  return NextResponse.json({ slug: post.slug });
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  if (!checkPassword(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const slug = (body as Record<string, string>).slug?.trim();
  if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });

  const post = buildPost(body, slug);
  if ("error" in post) return NextResponse.json({ error: post.error }, { status: 400 });

  await saveBlogPost(post);
  return NextResponse.json({ slug: post.slug });
}
