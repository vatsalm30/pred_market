import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { db, TABLE, queryAll } from "./db";

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

const PK = "blog";

export async function saveBlogPost(post: BlogPost): Promise<void> {
  const score = new Date(post.date).getTime() || Date.now();
  await db().send(new PutCommand({ TableName: TABLE, Item: { pk: PK, sk: post.slug, score, data: post } }));
}

export async function getAllPosts(): Promise<BlogPost[]> {
  const items = await queryAll(PK);
  return items
    .sort((x, y) => Number(y.score) - Number(x.score))
    .map((i) => i.data as BlogPost);
}

export async function getPost(slug: string): Promise<BlogPost | null> {
  const res = await db().send(new GetCommand({ TableName: TABLE, Key: { pk: PK, sk: slug } }));
  return (res.Item?.data as BlogPost | undefined) ?? null;
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
  const items = await queryAll(PK);
  if (items.length === 0) return false;
  const latest = Math.max(...items.map((i) => Number(i.score)));
  return Date.now() - latest < withinHours * 3600 * 1000;
}
