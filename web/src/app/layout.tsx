import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";

// Cloudflare Web Analytics site token: cookieless page-view counts for /admin/analytics
const CF_BEACON_TOKEN = process.env.NEXT_PUBLIC_CF_BEACON_TOKEN;

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://www.omnipred.com"),
  title: {
    template: "%s | OmniPred",
    default: "OmniPred — Compare Polymarket vs Kalshi Odds",
  },
  description:
    "See where Polymarket and Kalshi price the same prediction markets differently. Compare odds side-by-side and find arbitrage opportunities.",
  keywords: ["prediction markets", "polymarket", "kalshi", "odds comparison", "arbitrage", "prediction market data"],
  openGraph: {
    type: "website",
    siteName: "OmniPred",
    title: "OmniPred — Compare Polymarket vs Kalshi Odds",
    description: "Side-by-side odds comparison across prediction market platforms.",
  },
  twitter: { card: "summary_large_image" },
  icons: {
    icon: "/logo.svg",
    shortcut: "/logo.svg",
  },
};

const themeScript = `
(function() {
  try {
    var stored = localStorage.getItem('theme');
    var system = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    var theme = stored || system;
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  } catch(e) {
    document.documentElement.classList.add('dark');
  }
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col bg-(--bg) text-(--text-primary)">
        <Nav />
        <main className="flex-1">{children}</main>
        <Footer />
        {CF_BEACON_TOKEN && (
          <script
            defer
            src="https://static.cloudflareinsights.com/beacon.min.js"
            data-cf-beacon={JSON.stringify({ token: CF_BEACON_TOKEN })}
          />
        )}
      </body>
    </html>
  );
}
