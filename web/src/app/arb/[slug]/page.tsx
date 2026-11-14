import type { Metadata } from "next";
import ArbDetailClient from "./ArbDetailClient";
import { readData } from "@/lib/staticData";
import { shardOf } from "@/lib/shard";

type Props = { params: Promise<{ slug: string }> };

interface ShardEntry {
  matched: { poly_event: string; poly_label: string }[];
  arbs: { poly_event: string; poly_label: string; net_profit_pct: number; kalshi_leg: string; poly_leg: string; kalshi_ask: number; poly_ask: number }[];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const id = decodeURIComponent(slug);

  try {
    const entry = (await readData<Record<string, ShardEntry>>(`derived/pairs/${shardOf(id)}.json`))[id];
    const opp = entry?.arbs.sort((a, b) => b.net_profit_pct - a.net_profit_pct)[0];
    if (opp) {
      const profit = opp.net_profit_pct.toFixed(1);
      const description = `${opp.poly_label}: Kalshi ${opp.kalshi_leg} at ${(opp.kalshi_ask * 100).toFixed(1)}¢ plus Polymarket ${opp.poly_leg} at ${(opp.poly_ask * 100).toFixed(1)}¢ is a +${profit}% gap before fees. Check both markets' rules before trading.`;
      // Share card rendered at build time by scripts/og-images.mjs
      const image = { url: `/data/derived/og/${encodeURIComponent(id)}.png`, width: 1200, height: 630, alt: `+${profit}% gap on ${opp.poly_label}` };
      return {
        title: `+${profit}% — ${opp.poly_label}`,
        description,
        openGraph: { title: `+${profit}% gap: ${opp.poly_label} (${opp.poly_event})`, description, images: [image] },
        twitter: { card: "summary_large_image", title: `+${profit}% gap: ${opp.poly_label}`, description, images: [image.url] },
      };
    }
    const row = entry?.matched[0];
    if (row) {
      const description = `${row.poly_label} (${row.poly_event}): Kalshi and Polymarket odds side by side, with price history and alerts.`;
      return { title: `${row.poly_label} — Kalshi vs Polymarket odds`, description, openGraph: { title: `${row.poly_label}: Kalshi vs Polymarket`, description } };
    }
    return { title: "Market Not Found" };
  } catch {
    return { title: "Arbitrage Opportunity" };
  }
}

export default async function ArbDetailPage({ params }: Props) {
  const { slug } = await params;
  return <ArbDetailClient slug={slug} />;
}
