import Link from "next/link";
import { PolymarketLogo, KalshiLogo } from "./PlatformLogos";

export default function Footer() {
  return (
    <footer className="border-t border-[--border-subtle] mt-24">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex flex-col sm:flex-row items-start justify-between gap-8">
          <div>
            <p className="font-bold text-[--text-primary] mb-1">OddsArb</p>
            <p className="text-[--text-secondary] text-sm max-w-xs leading-relaxed">
              Cross-platform prediction market comparison. Data sourced directly from Polymarket and Kalshi.
            </p>
            <div className="flex items-center gap-3 mt-4">
              <a
                href="https://polymarket.com"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-[--text-muted] hover:text-[--text-primary] transition-colors"
              >
                <PolymarketLogo size={16} /> Polymarket
              </a>
              <a
                href="https://kalshi.com"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-[--text-muted] hover:text-[--text-primary] transition-colors"
              >
                <KalshiLogo size={16} /> Kalshi
              </a>
            </div>
          </div>
          <div className="flex gap-12">
            <div>
              <p className="text-xs font-medium text-[--text-muted] uppercase tracking-wider mb-3">Tool</p>
              <ul className="space-y-2">
                <li><Link href="/events?view=compare" className="text-sm text-[--text-secondary] hover:text-[--text-primary] transition-colors">Compare Markets</Link></li>
                <li><Link href="/events" className="text-sm text-[--text-secondary] hover:text-[--text-primary] transition-colors">All Markets</Link></li>
                <li><Link href="/arbitrage" className="text-sm text-[--text-secondary] hover:text-[--text-primary] transition-colors">Arbitrage Scanner</Link></li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-medium text-[--text-muted] uppercase tracking-wider mb-3">Contact</p>
              <ul className="space-y-2">
                <li><a href="mailto:vatsalm30@gmail.com" className="text-sm text-[--text-secondary] hover:text-[--text-primary] transition-colors">Get in touch</a></li>
              </ul>
            </div>
          </div>
        </div>
        <div className="mt-8 pt-6 border-t border-[--border-subtle] flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-[--text-muted] text-xs">© {new Date().getFullYear()} OddsArb. Not affiliated with Polymarket or Kalshi.</p>
          <p className="text-[--text-muted] text-xs">Not financial advice.</p>
        </div>
      </div>
    </footer>
  );
}
