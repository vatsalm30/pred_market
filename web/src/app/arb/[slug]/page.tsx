import type { Metadata } from "next";
import ArbDetailClient from "./ArbDetailClient";
import { getArbMeta } from "@/lib/staticData";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const decodedSlug = decodeURIComponent(slug);

  try {
    const opp = await getArbMeta(decodedSlug);

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
