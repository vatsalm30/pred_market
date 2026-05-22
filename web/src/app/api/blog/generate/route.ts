import { NextRequest, NextResponse } from "next/server";
import { Receiver } from "@upstash/qstash";
import fs from "node:fs";
import path from "node:path";
import { saveBlogPost, recentPostExists, type BlogPost } from "@/lib/blog";
import type { ArbitrageOpportunity } from "@/lib/csv";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const GEMINI_MODEL = "gemini-3.5-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const SYSTEM_PROMPT =
  "Write like a trader talking to traders — data-forward, no hype, no filler. Short and direct. " +
  "Focus on the numbers and what they mean for execution. Note liquidity and volume where relevant.";

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    slug: { type: "STRING" },
    metaTitle: { type: "STRING" },
    metaDescription: { type: "STRING" },
    body: { type: "STRING" },
    table: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          market: { type: "STRING" },
          polyPrice: { type: "STRING" },
          kalshiPrice: { type: "STRING" },
          gapPct: { type: "STRING" },
          net500: { type: "STRING" },
        },
        required: ["market", "polyPrice", "kalshiPrice", "gapPct", "net500"],
      },
    },
    tags: { type: "ARRAY", items: { type: "STRING" } },
    date: { type: "STRING" },
  },
  required: ["title", "slug", "metaTitle", "metaDescription", "body", "table", "tags", "date"],
};

function buildPrompt(opps: ArbitrageOpportunity[], date: string): string {
  const rows = opps
    .slice(0, 5)
    .map((o, i) => {
      const polyPct = (o.poly_ask * 100).toFixed(1);
      const kalshiPct = (o.kalshi_ask * 100).toFixed(1);
      const est500 = ((o.net_profit_pct / 100) * 500).toFixed(0);
      const volNote =
        (o.poly_volume ?? 0) + (o.kalshi_volume ?? 0) === 0
          ? "no reported volume"
          : `poly vol $${o.poly_volume?.toFixed(0)}, kalshi vol $${o.kalshi_volume?.toFixed(0)}`;
      return (
        `${i + 1}. ${o.poly_event}\n` +
        `   Poly: ${o.poly_label} (${o.poly_leg}) @ ${polyPct}¢ | Kalshi: ${o.kalshi_label} (${o.kalshi_leg}) @ ${kalshiPct}¢\n` +
        `   Net profit: ${o.net_profit_pct.toFixed(2)}% | $500 return: $${est500} | ${volNote}\n` +
        `   Expires: Poly ${o.poly_end_date ?? "?"}, Kalshi ${o.kalshi_end_date ?? "?"}`
      );
    })
    .join("\n\n");

  return (
    `Today is ${date}.\n\n` +
    `Top arbitrage gaps on Kalshi vs Polymarket right now:\n\n${rows}\n\n` +
    `Write a short market movements post. Lead with the #1 gap as the headline. ` +
    `Include actual numbers. Explain what traders need to know to act on this. ` +
    `The slug should be hyphenated, based on the top event name, no date in the slug. ` +
    `Set date to "${date}".`
  );
}

async function callGemini(prompt: string): Promise<BlogPost> {
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

  return JSON.parse(text) as BlogPost;
}

async function generatePost(): Promise<{ skipped?: boolean; slug?: string }> {
  if (await recentPostExists(20)) {
    return { skipped: true };
  }

  const dataPath = path.join(process.cwd(), "public/data/arbitrage_opportunities.json");
  const raw: ArbitrageOpportunity[] = JSON.parse(fs.readFileSync(dataPath, "utf-8"));

  // Prefer well-matched opportunities; fall back to top overall if < 3 pass
  const wellMatched = raw
    .filter((o) => o.event_score >= 0.85 && o.outcome_score >= 0.85)
    .sort((a, b) => b.net_profit_pct - a.net_profit_pct)
    .slice(0, 5);

  const top5 =
    wellMatched.length >= 3
      ? wellMatched
      : [...raw].sort((a, b) => b.net_profit_pct - a.net_profit_pct).slice(0, 5);

  if (top5.length === 0) throw new Error("No arbitrage opportunities found");

  const today = new Date().toISOString().slice(0, 10);
  const prompt = buildPrompt(top5, today);
  const post = await callGemini(prompt);

  await saveBlogPost(post);
  return { slug: post.slug };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const result = await generatePost();
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const signature = req.headers.get("upstash-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }

  const body = await req.text();
  const receiver = new Receiver({
    currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY ?? "",
    nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY ?? "",
  });

  try {
    await receiver.verify({ signature, body, url: req.url });
  } catch (e) {
    return NextResponse.json(
      { error: "Invalid signature", message: (e as Error).message },
      { status: 401 }
    );
  }

  try {
    const result = await generatePost();
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
