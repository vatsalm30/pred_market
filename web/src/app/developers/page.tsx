import type { Metadata } from "next";
import DevelopersClient from "./DevelopersClient";

export const metadata: Metadata = {
  title: "OmniPred Data Stream — Live Kalshi & Polymarket Order Books and Arbs",
  description:
    "WebSocket feed of top-of-book quotes for matched Kalshi and Polymarket markets, under 100 ms median from the exchange, with a live cross-venue arbitrage stream.",
};

export default function DevelopersPage() {
  return <DevelopersClient />;
}
