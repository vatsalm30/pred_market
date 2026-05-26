import type { Metadata } from "next";
import fs from "fs";
import path from "path";
import EventDetailClient from "./EventDetailClient";
import type { AllEvent } from "@/lib/csv";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const decodedSlug = decodeURIComponent(slug);

  try {
    const filePath = path.join(process.cwd(), "public", "data", "all_events.json");
    const events: AllEvent[] = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const event = events.find((e) => e.id === decodedSlug);

    if (!event) return { title: "Market Not Found" };

    const platforms = [
      event.platforms.includes("polymarket") ? "Polymarket" : null,
      event.platforms.includes("kalshi") ? "Kalshi" : null,
    ].filter(Boolean).join(" and ");

    const prices: string[] = [];
    if (event.yes_price_poly != null)
      prices.push(`${(event.yes_price_poly * 100).toFixed(0)}% on Polymarket`);
    if (event.yes_price_kalshi != null)
      prices.push(`${(event.yes_price_kalshi * 100).toFixed(0)}% on Kalshi`);

    const description =
      prices.length > 0
        ? `${event.title} — currently priced at ${prices.join(", ")}. Compare live odds and arbitrage opportunities across ${platforms}.`
        : `Compare live prediction market odds for "${event.title}" across ${platforms}.`;

    return {
      title: event.title,
      description,
      openGraph: { title: event.title, description },
    };
  } catch {
    return { title: "Market" };
  }
}

export default async function EventDetailPage({ params }: Props) {
  const { slug } = await params;
  return <EventDetailClient slug={slug} />;
}
