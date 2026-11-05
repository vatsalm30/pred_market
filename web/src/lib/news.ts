import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { db, TABLE, queryAll } from "./db";

export interface NewsStory {
  slug: string;
  headline: string;
  commentary: string;
  url: string;
  tag?: string;
  date: string;       // YYYY-MM-DD
  createdAt: string;  // ISO timestamp
  ogImage?: string;
}

const PK = "news";

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
  await db().send(new PutCommand({ TableName: TABLE, Item: { pk: PK, sk: story.slug, score, data: story } }));
}

export async function getAllStories(): Promise<NewsStory[]> {
  const items = await queryAll(PK);
  return items
    .sort((x, y) => Number(y.score) - Number(x.score))
    .map((i) => i.data as NewsStory);
}

export async function getStory(slug: string): Promise<NewsStory | null> {
  const res = await db().send(new GetCommand({ TableName: TABLE, Key: { pk: PK, sk: slug } }));
  return (res.Item?.data as NewsStory | undefined) ?? null;
}
