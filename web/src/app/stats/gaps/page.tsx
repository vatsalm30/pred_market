import type { Metadata } from "next";
import GapStats from "./GapStats";

export const metadata: Metadata = {
  title: "How Long Do Prediction Market Arbitrage Gaps Last?",
  description:
    "Live statistics on how long Kalshi–Polymarket arbitrage gaps stay open before prices close them, by size of gap.",
};

export default function GapStatsPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <h1 className="text-2xl sm:text-3xl font-bold text-(--text-primary) mb-2">How long do gaps last?</h1>
      <p className="text-sm text-(--text-secondary) mb-8 max-w-2xl">
        Every time a price gap between Kalshi and Polymarket opens, our stream times how long it stays open before the
        prices move back. This is what that looks like across all matched markets, before fees.
      </p>
      <GapStats />
    </div>
  );
}
