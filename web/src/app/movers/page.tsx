import type { Metadata } from "next";
import Link from "next/link";
import MoversList from "@/components/MoversList";

export const metadata: Metadata = {
  title: "Biggest Prediction Market Movers Today — Kalshi & Polymarket",
  description: "The matched Kalshi and Polymarket markets whose odds moved most in the last 24 hours.",
};

export default function MoversPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <h1 className="text-2xl sm:text-3xl font-bold text-(--text-primary) mb-2">Biggest movers today</h1>
      <p className="text-sm text-(--text-secondary) mb-6">
        Markets listed on both Kalshi and Polymarket, ranked by how far their implied probability moved in the last 24 hours.
        We average the two venues and record prices every hour. Click a market for its chart and to set an alert.
      </p>
      <MoversList limit={20} />
      <p className="text-xs text-(--text-muted) mt-6">
        Want these every morning? Turn on the daily digest in your <Link href="/dashboard#alerts" className="underline">dashboard</Link>.
      </p>
    </div>
  );
}
