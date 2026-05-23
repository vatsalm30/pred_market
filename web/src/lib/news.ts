import type { Redis as RedisType } from "@upstash/redis";

export interface NewsStory {
  slug: string;
  headline: string;
  commentary: string;
  url: string;
  tag?: string;
  date: string;       // YYYY-MM-DD
  createdAt: string;  // ISO timestamp
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

const STORY_PREFIX = "news:story:";
const INDEX_KEY = "news:index";

export function generateSlug(headline: string): string {
  const base = headline
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  const suffix = Date.now().toString(36).slice(-4);
  return `${base}-${suffix}`;
}

export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export async function saveStory(story: NewsStory): Promise<void> {
  const score = new Date(story.date + "T00:00:00Z").getTime() || Date.now();
  await redis().set(`${STORY_PREFIX}${story.slug}`, JSON.stringify(story));
  await redis().zadd(INDEX_KEY, { score, member: story.slug });
}

export async function getAllStories(): Promise<NewsStory[]> {
  const slugs = (await redis().zrange(INDEX_KEY, 0, -1, { rev: true })) as string[];
  if (slugs.length === 0) return [];

  const pipeline = redis().pipeline();
  for (const slug of slugs) pipeline.get(`${STORY_PREFIX}${slug}`);
  const results = await pipeline.exec();

  return (results as unknown[])
    .map((raw) => {
      if (!raw) return null;
      try {
        return (typeof raw === "string" ? JSON.parse(raw) : raw) as NewsStory;
      } catch {
        return null;
      }
    })
    .filter((s): s is NewsStory => s !== null);
}

export async function getStory(slug: string): Promise<NewsStory | null> {
  const raw = await redis().get<string>(`${STORY_PREFIX}${slug}`);
  if (!raw) return null;
  try {
    return (typeof raw === "string" ? JSON.parse(raw) : raw) as NewsStory;
  } catch {
    return null;
  }
}
