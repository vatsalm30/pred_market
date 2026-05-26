import type { Metadata } from "next";
import fs from "fs";
import path from "path";
import ArbDetailClient from "./ArbDetailClient";
import type { ArbitrageOpportunity } from "@/lib/csv";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const decodedSlug = decodeURIComponent(slug);

  try {
    const filePath = path.join(process.cwd(), "public", "data", "arbitrage_opportunities.json");
    const opps: ArbitrageOpportunity[] = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const opp = opps.find((o) => o.kalshi_market_id === decodedSlug);

    if (!opp) return { title: "Opportunity Not Found" };

    const profit = opp.net_profit_pct.toFixed(1);
    const description = `Buy ${opp.poly_label} on both Polymarket and Kalshi for a risk-free +${profit}% profit. Kalshi ${opp.kalshi_leg} @ ${(opp.kalshi_ask * 100).toFixed(1)}¢ + Polymarket ${opp.poly_leg} @ ${(opp.poly_ask * 100).toFixed(1)}¢.`;

    return {
      title: `+${profit}% — ${opp.poly_label}`,
      description,
      openGraph: {
        title: `Arbitrage: +${profit}% on ${opp.poly_event}`,
        description,
      },
    };
  } catch {
    return { title: "Arbitrage Opportunity" };
  }
}

export default async function ArbDetailPage({ params }: Props) {
  const { slug } = await params;
  return <ArbDetailClient slug={slug} />;
}
