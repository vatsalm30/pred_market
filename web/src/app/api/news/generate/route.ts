import { NextRequest, NextResponse } from "next/server";
import { saveStory, generateSlug, getAllStories, type NewsStory } from "@/lib/news";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const GEMINI_MODEL = "gemini-3.5-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const FEED_URL =
  "https://news.google.com/rss/search?q=" +
  encodeURIComponent('Kalshi OR Polymarket OR "prediction market" when:1d') +
  "&hl=en-US&gl=US&ceid=US:en";
const MAX_CANDIDATES = 8;
const MAX_STORIES = 2;
const UA = "OmniPredBot/1.0 (+https://omnipred.com)";
const TAGS = ["Elections", "Regulation", "Market Data", "Kalshi", "Polymarket", "Sports", "Crypto", "Economy"];

const SYSTEM_PROMPT =
  "You curate news for OmniPred, a site that tracks price gaps between Kalshi and Polymarket. " +
  "Write like a trader talking to traders — data-forward, no hype, no filler. " +
  "Only state facts that appear in the article text you are given, and attribute them to the outlet " +
  "(e.g. \"Reuters reports...\"). Never invent numbers, quotes, or outcomes.";

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    stories: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          index: { type: "INTEGER" },
          headline: { type: "STRING" },
          commentary: { type: "STRING" },
          tag: { type: "STRING", enum: TAGS },
        },
        required: ["index", "headline", "commentary", "tag"],
      },
    },
  },
  required: ["stories"],
};

interface Candidate {
  title: string;
  source: string;
  url: string;
  description?: string;
  ogImage?: string;
}

const decodeEntities = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

function parseFeed(xml: string): { title: string; source: string; link: string }[] {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, item]) => {
    const source = decodeEntities(item.match(/<source[^>]*>([^<]*)<\/source>/)?.[1] ?? "");
    const title = decodeEntities(item.match(/<title>([^<]*)<\/title>/)?.[1] ?? "").replace(` - ${source}`, "");
    return { title, source, link: item.match(/<link>([^<]+)<\/link>/)?.[1] ?? "" };
  });
}

/** Google News RSS links point at news.google.com; resolve them to the publisher's URL. */
async function resolveGoogleNewsUrl(link: string): Promise<string | undefined> {
  const id = link.split("/articles/")[1]?.split("?")[0];
  if (!id) return undefined;
  const page = await (await fetch(`https://news.google.com/rss/articles/${id}`)).text();
  const sig = page.match(/data-n-a-sg="([^"]+)"/)?.[1];
  const ts = page.match(/data-n-a-ts="([^"]+)"/)?.[1];
  if (!sig || !ts) return undefined;
  const inner = JSON.stringify([
    "garturlreq",
    [["X", "X", ["X", "X"], null, null, 1, 1, "US:en", null, 1, null, null, null, null, null, 0, 1], "X", "X", 1, [1, 1, 1], 1, 1, null, 0, 0, null, 0],
    id,
    Number(ts),
    sig,
  ]);
  const res = await fetch("https://news.google.com/_/DotsSplashUi/data/batchexecute", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: "f.req=" + encodeURIComponent(JSON.stringify([[["Fbv4je", inner, null, "generic"]]])),
  });
  return (await res.text()).match(/garturlres\\",\\"(https?:[^\\"]+)/)?.[1];
}

function metaContent(html: string, prop: string): string | undefined {
  const raw =
    html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, "i"))?.[1] ??
    html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, "i"))?.[1];
  return raw ? decodeEntities(raw) : undefined;
}

/** Article summary + image from the publisher page; many block bots, so both are optional. */
async function fetchMeta(url: string): Promise<{ description?: string; ogImage?: string }> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000), headers: { "User-Agent": UA } });
    if (!res.ok) return {};
    const html = await res.text();
    return {
      description: metaContent(html, "og:description") ?? metaContent(html, "description"),
      ogImage: metaContent(html, "og:image"),
    };
  } catch {
    return {};
  }
}

async function loadCandidates(seenUrls: Set<string>): Promise<Candidate[]> {
  const items = parseFeed(await (await fetch(FEED_URL)).text()).slice(0, MAX_CANDIDATES);
  const resolved = await Promise.all(
    items.map(async (item) => {
      const url = await resolveGoogleNewsUrl(item.link).catch(() => undefined);
      if (!url || seenUrls.has(url)) return null;
      return { title: item.title, source: item.source, url, ...(await fetchMeta(url)) };
    })
  );
  return resolved.filter((c): c is Candidate => c !== null);
}

function buildPrompt(candidates: Candidate[], recentHeadlines: string[], date: string): string {
  const list = candidates
    .map((c, i) => `${i}. [${c.source}] ${c.title}${c.description ? `\n   Summary: ${c.description}` : ""}`)
    .join("\n");
  return (
    `Today is ${date}.\n\n` +
    `Articles from the last day:\n${list}\n\n` +
    `Headlines we already published (skip the same stories):\n${recentHeadlines.map((h) => `- ${h}`).join("\n") || "(none)"}\n\n` +
    `Pick up to ${MAX_STORIES} articles that matter most to people trading on Kalshi or Polymarket ` +
    `(regulation, volumes, notable market moves, platform news). Skip duplicates of each other, ` +
    `listicles, promos, and anything not really about prediction markets. Return an empty list if nothing qualifies.\n` +
    `For each pick: index from the list, a rewritten factual headline (not the original wording), ` +
    `and 2-4 sentences of commentary in one paragraph: what the article reports, then why it matters for traders.`
  );
}

async function callGemini(prompt: string): Promise<{ index: number; headline: string; commentary: string; tag: string }[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const res = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${err}`);
  }

  const json = await res.json();
  const text: string = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no content");

  return JSON.parse(text).stories ?? [];
}

async function generateStories(): Promise<{ slugs: string[]; candidates: number }> {
  const existing = await getAllStories();
  const candidates = await loadCandidates(new Set(existing.map((s) => s.url)));
  if (candidates.length === 0) return { slugs: [], candidates: 0 };

  const today = new Date().toISOString().slice(0, 10);
  const picks = await callGemini(buildPrompt(candidates, existing.slice(0, 15).map((s) => s.headline), today));

  const slugs: string[] = [];
  for (const pick of picks.slice(0, MAX_STORIES)) {
    const c = candidates[pick.index];
    if (!c) continue;
    const story: NewsStory = {
      slug: generateSlug(pick.headline),
      headline: pick.headline.trim(),
      commentary: pick.commentary.trim(),
      url: c.url,
      tag: pick.tag,
      date: today,
      createdAt: new Date().toISOString(),
      ogImage: c.ogImage,
    };
    await saveStory(story);
    slugs.push(story.slug);
  }
  return { slugs, candidates: candidates.length };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const result = await generateStories();
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
