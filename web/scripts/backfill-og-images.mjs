/**
 * Backfills ogImage for news stories that don't have one yet.
 * Uses Upstash Redis REST API directly — no server needed.
 *
 * Usage: node scripts/backfill-og-images.mjs
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env");
const envVars = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => l.split("=").map((p, i) => (i === 0 ? p.trim() : l.slice(l.indexOf("=") + 1).replace(/^["']|["']$/g, "").trim())))
    .filter(([k]) => k)
);

const REDIS_URL = envVars.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = envVars.UPSTASH_REDIS_REST_TOKEN;

const STORY_PREFIX = "news:story:";
const INDEX_KEY = "news:index";

async function redisCmd(...args) {
  const res = await fetch(`${REDIS_URL}/${args.map(encodeURIComponent).join("/")}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  });
  const json = await res.json();
  if (json.error) throw new Error(`Redis error: ${json.error}`);
  return json.result;
}

async function fetchOgImage(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "OmniPredBot/1.0 (+https://omnipred.com)" },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const html = await res.text();
    const match =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ??
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

async function main() {
  // Get all slugs sorted by score descending
  const slugs = await redisCmd("ZRANGE", INDEX_KEY, "+inf", "-inf", "BYSCORE", "REV", "LIMIT", "0", "1000");
  if (!slugs || slugs.length === 0) {
    console.log("No stories found.");
    return;
  }
  console.log(`Found ${slugs.length} stories.`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const slug of slugs) {
    const raw = await redisCmd("GET", `${STORY_PREFIX}${slug}`);
    if (!raw) { failed++; continue; }

    const story = typeof raw === "string" ? JSON.parse(raw) : raw;

    if (story.ogImage) {
      console.log(`  skip  ${slug} (already has image)`);
      skipped++;
      continue;
    }

    process.stdout.write(`  fetch ${slug} (${story.url}) ... `);
    const ogImage = await fetchOgImage(story.url);

    if (ogImage) {
      story.ogImage = ogImage;
      await redisCmd("SET", `${STORY_PREFIX}${slug}`, JSON.stringify(story));
      console.log(`OK → ${ogImage.slice(0, 60)}${ogImage.length > 60 ? "…" : ""}`);
      updated++;
    } else {
      console.log("no og:image found");
      failed++;
    }

    // Small delay to avoid hammering external sites
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`\nDone. Updated: ${updated}  Skipped: ${skipped}  No image: ${failed}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
