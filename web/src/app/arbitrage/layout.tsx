import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Arbitrage Scanner",
  description:
    "Live arbitrage scanner for Polymarket and Kalshi. Find risk-free profit opportunities where pricing gaps between platforms let you buy both sides for less than $1.",
};

export default function ArbitrageLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
