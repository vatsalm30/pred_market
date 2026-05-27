import type { Redis as RedisType } from "@upstash/redis";

export interface BlogTableRow {
  market: string;
  polyPrice: string;
  kalshiPrice: string;
  gapPct: string;
  net500: string;
}

export interface BlogPost {
  title: string;
  slug: string;
  metaTitle: string;
  metaDescription: string;
  body: string;
  table: BlogTableRow[];
  tags: string[];
  date: string;
  ogImage?: string;
}

let _redis: RedisType | null = null;
function redis(): RedisType {
  if (!_redis) {
    const { Redis } = require("@upstash/redis");
    _redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    }) as RedisType;
  }
  return _redis!;
}

const POST_PREFIX = "blog:post:";
const INDEX_KEY = "blog:index";

export async function saveBlogPost(post: BlogPost): Promise<void> {
  const score = new Date(post.date).getTime() || Date.now();
  await redis().set(`${POST_PREFIX}${post.slug}`, JSON.stringify(post));
  await redis().zadd(INDEX_KEY, { score, member: post.slug });
}

export async function getAllPosts(): Promise<BlogPost[]> {
  const slugs = (await redis().zrange(INDEX_KEY, 0, -1, { rev: true })) as string[];
  if (slugs.length === 0) return [];

  const pipeline = redis().pipeline();
  for (const slug of slugs) pipeline.get(`${POST_PREFIX}${slug}`);
  const results = await pipeline.exec();

  return (results as unknown[])
    .map((raw) => {
      if (!raw) return null;
      try {
        return (typeof raw === "string" ? JSON.parse(raw) : raw) as BlogPost;
      } catch {
        return null;
      }
    })
    .filter((p): p is BlogPost => p !== null);
}

export async function getPost(slug: string): Promise<BlogPost | null> {
  const raw = await redis().get<string>(`${POST_PREFIX}${slug}`);
  if (!raw) return null;
  try {
    return (typeof raw === "string" ? JSON.parse(raw) : raw) as BlogPost;
  } catch {
    return null;
  }
}

export function generateSlug(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  const suffix = Date.now().toString(36).slice(-4);
  return `${base}-${suffix}`;
}

export async function recentPostExists(withinHours = 20): Promise<boolean> {
  const [latestSlug] = (await redis().zrange(INDEX_KEY, -1, -1)) as string[];
  if (!latestSlug) return false;
  const score = await redis().zscore(INDEX_KEY, latestSlug);
  if (score === null) return false;
  return Date.now() - Number(score) < withinHours * 3600 * 1000;
}
