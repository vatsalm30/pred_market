import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Arbitrage Alerts",
  description:
    "Get notified instantly when new arbitrage opportunities appear on Polymarket and Kalshi. Subscribe to the Telegram bot for real-time alerts.",
};

export default function AlertsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
