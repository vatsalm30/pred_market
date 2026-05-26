import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "All Markets",
  description:
    "Browse 15,000+ prediction market events across Polymarket and Kalshi. Compare live odds, find arbitrage opportunities, and track your favorite topics.",
};

export default function EventsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
