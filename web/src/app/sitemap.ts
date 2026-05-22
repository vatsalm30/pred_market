import type { MetadataRoute } from "next";

const BASE_URL = process.env.SITE_URL ?? "https://omnipred.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: BASE_URL,                lastModified: new Date(), changeFrequency: "daily",  priority: 1.0 },
    { url: `${BASE_URL}/events`,    lastModified: new Date(), changeFrequency: "hourly", priority: 0.9 },
    { url: `${BASE_URL}/arbitrage`, lastModified: new Date(), changeFrequency: "hourly", priority: 0.8 },
    { url: `${BASE_URL}/alerts`,    lastModified: new Date(), changeFrequency: "weekly", priority: 0.7 },
  ];

  let eventRoutes: MetadataRoute.Sitemap = [];
  try {
    const res = await fetch(`${BASE_URL}/data/all_events.json`, { next: { revalidate: 1800 } });
    if (res.ok) {
      const events = (await res.json()) as Array<{ id: string }>;
      eventRoutes = events
        .filter((e) => e.id)
        .map((e) => ({
          url: `${BASE_URL}/events/${encodeURIComponent(e.id)}`,
          lastModified: new Date(),
          changeFrequency: "daily" as const,
          priority: 0.6,
        }));
    }
  } catch {
    // fetch failed — return static routes only
  }

  return [...staticRoutes, ...eventRoutes];
}
