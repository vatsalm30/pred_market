import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    template: "%s | OddsArb",
    default: "OddsArb — Compare Polymarket vs Kalshi Odds",
  },
  description:
    "See where Polymarket and Kalshi price the same prediction markets differently. Compare odds side-by-side and find arbitrage opportunities.",
  keywords: ["prediction markets", "polymarket", "kalshi", "odds comparison", "arbitrage", "prediction market data"],
  openGraph: {
    type: "website",
    siteName: "OddsArb",
    title: "OddsArb — Compare Polymarket vs Kalshi Odds",
    description: "Side-by-side odds comparison across prediction market platforms.",
  },
  twitter: { card: "summary_large_image" },
};

const themeScript = `
(function() {
  try {
    var stored = localStorage.getItem('theme');
    var system = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    var theme = stored || system;
    if (theme === 'dark') document.documentElement.classList.add('dark');
  } catch(e) {
    document.documentElement.classList.add('dark');
  }
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full dark`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col bg-[--bg] text-[--text-primary]">
        <Nav />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
