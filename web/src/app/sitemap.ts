import type { MetadataRoute } from "next";
import fs from "node:fs";
import path from "node:path";

const BASE_URL = process.env.SITE_URL ?? "https://omnipred.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: BASE_URL,                  lastModified: new Date(), changeFrequency: "daily",  priority: 1.0 },
    { url: `${BASE_URL}/events`,      lastModified: new Date(), changeFrequency: "hourly", priority: 0.9 },
    { url: `${BASE_URL}/arbitrage`,   lastModified: new Date(), changeFrequency: "hourly", priority: 0.8 },
    { url: `${BASE_URL}/alerts`,      lastModified: new Date(), changeFrequency: "weekly", priority: 0.7 },
  ];

  let eventRoutes: MetadataRoute.Sitemap = [];
  try {
    const raw = fs.readFileSync(
      path.join(process.cwd(), "public/data/all_events.json"),
      "utf-8"
    );
    const events = JSON.parse(raw) as Array<{ id: string }>;
    eventRoutes = events
      .filter((e) => e.id)
      .map((e) => ({
        url: `${BASE_URL}/events/${encodeURIComponent(e.id)}`,
        lastModified: new Date(),
        changeFrequency: "daily" as const,
        priority: 0.6,
      }));
  } catch {
    // data file not present at build time — skip dynamic routes
  }

  return [...staticRoutes, ...eventRoutes];
}
