"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { motion, useInView, animate } from "framer-motion";
import { ArrowRight, Zap, TrendingUp } from "lucide-react";
import { PolymarketLogo, KalshiLogo } from "@/components/PlatformLogos";

/* ── Animated counter ────────────────────────────────────── */
function Counter({ to, suffix = "" }: { to: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  useEffect(() => {
    if (!inView || !ref.current) return;
    const ctrl = animate(0, to, {
      duration: 1.4,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        if (ref.current) ref.current.textContent = Math.round(v) + suffix;
      },
    });
    return () => ctrl.stop();
  }, [inView, to, suffix]);
  return <span ref={ref}>0{suffix}</span>;
}

/* ── Reveal wrapper ──────────────────────────────────────── */
function Reveal({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 22 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ── Scrolling ticker ────────────────────────────────────── */
const TICKER_ITEMS = [
  { label: "2026 FIFA World Cup Winner", platform: "poly" as const },
  { label: "NBA MVP", platform: "kalshi" as const },
  { label: "Brazil Presidential Election", platform: "poly" as const },
  { label: "2026 French Open", platform: "kalshi" as const },
  { label: "Republican Primary 2028", platform: "poly" as const },
  { label: "California Governor", platform: "kalshi" as const },
  { label: "PGA Championship", platform: "poly" as const },
  { label: "Seoul Mayoral Election", platform: "kalshi" as const },
  { label: "Congress Balance of Power", platform: "poly" as const },
  { label: "Israel Prime Minister", platform: "kalshi" as const },
];

function Ticker() {
  const doubled = [...TICKER_ITEMS, ...TICKER_ITEMS];
  return (
    <div className="overflow-hidden border-y border-[--border-subtle] py-3 select-none">
      <div className="flex gap-8 marquee-track w-max">
        {doubled.map((item, i) => (
          <div key={i} className="flex items-center gap-2 whitespace-nowrap">
            {item.platform === "poly" ? (
              <PolymarketLogo size={14} />
            ) : (
              <KalshiLogo size={14} />
            )}
            <span className="text-xs text-[--text-secondary]">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Sample markets for the preview table ────────────────── */
const PREVIEW_MARKETS = [
  {
    event: "2026 FIFA World Cup",
    outcome: "Spain",
    poly: "16.2%",
    kalshi: "14.1%",
    gap: "+2.1pp",
    category: "Sports",
  },
  {
    event: "2028 GOP Primary",
    outcome: "Donald Trump",
    poly: "41.0%",
    kalshi: "38.0%",
    gap: "+3.0pp",
    category: "Politics",
  },
  {
    event: "NBA MVP",
    outcome: "Shai Gilgeous-Alexander",
    poly: "31.0%",
    kalshi: "28.0%",
    gap: "+3.0pp",
    category: "Sports",
  },
  {
    event: "Brazil Presidential",
    outcome: "Lula da Silva",
    poly: "44.0%",
    kalshi: "41.0%",
    gap: "+3.0pp",
    category: "Politics",
  },
];

/* ── Main page ───────────────────────────────────────────── */
export default function HomePage() {
  const [heroReady, setHeroReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setHeroReady(true), 50);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="overflow-x-hidden">
      {/* ── Hero ─────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16">
        {/* Platform logos — floating */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={heroReady ? { opacity: 1 } : {}}
          transition={{ duration: 0.8 }}
          className="flex items-center gap-3 mb-10"
        >
          <div className="float-a">
            <PolymarketLogo size={36} />
          </div>
          <span className="text-[--text-muted] text-sm">vs</span>
          <div className="float-b">
            <KalshiLogo size={36} />
          </div>
        </motion.div>

        {/* Headline */}
        <div className="max-w-3xl">
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={heroReady ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.7, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.06] text-[--text-primary] mb-6"
          >
            Compare odds across prediction markets
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={heroReady ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.7, delay: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="text-[--text-secondary] text-lg sm:text-xl leading-relaxed max-w-xl mb-10"
          >
            Polymarket and Kalshi are pricing the same events differently. We match them up and show you where the gaps are.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={heroReady ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.34, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col sm:flex-row gap-3"
          >
            <Link
              href="/markets"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[--text-primary] text-[--bg] font-semibold text-sm hover:opacity-85 transition-opacity"
            >
              See all matched markets
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/arbitrage"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl surface text-[--text-secondary] font-medium text-sm hover:text-[--text-primary] transition-colors"
            >
              <Zap className="w-4 h-4 text-[--arb-amber]" />
              Arbitrage scanner
            </Link>
          </motion.div>
        </div>
      </section>

      {/* ── Ticker ───────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={heroReady ? { opacity: 1 } : {}}
        transition={{ duration: 0.8, delay: 0.5 }}
      >
        <Ticker />
      </motion.div>

      {/* ── Stats — not a grid, prose-embedded ───────────── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <Reveal>
          <p className="text-[--text-secondary] text-base leading-loose max-w-2xl">
            Right now we track{" "}
            <strong className="text-[--text-primary] font-semibold tabular-nums">
              <Counter to={33} suffix="+" />
            </strong>{" "}
            matched events across both platforms, covering{" "}
            <strong className="text-[--text-primary] font-semibold tabular-nums">
              <Counter to={505} suffix="+" />
            </strong>{" "}
            individual outcome pairs. Wherever prices diverge, we surface it. There are{" "}
            <strong className="text-[--text-primary] font-semibold tabular-nums">
              <Counter to={289} suffix="+" />
            </strong>{" "}
            arbitrage opportunities in the current snapshot.
          </p>
        </Reveal>
      </section>

      {/* ── Preview table ─────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <Reveal>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl font-semibold text-[--text-primary]">A sample of what we track</h2>
            <Link
              href="/markets"
              className="text-sm text-[--text-secondary] hover:text-[--text-primary] transition-colors flex items-center gap-1"
            >
              All markets <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </Reveal>

        <Reveal delay={0.08}>
          <div className="surface rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[--border-subtle]">
                    <th className="text-left px-5 py-3.5 text-[--text-muted] font-medium text-xs uppercase tracking-wider">Event</th>
                    <th className="text-left px-4 py-3.5 text-[--text-muted] font-medium text-xs uppercase tracking-wider hidden sm:table-cell">Outcome</th>
                    <th className="text-center px-4 py-3.5 font-medium text-xs">
                      <span className="flex items-center justify-center gap-1.5 text-[--text-muted]">
                        <PolymarketLogo size={14} /> Poly
                      </span>
                    </th>
                    <th className="text-center px-4 py-3.5 font-medium text-xs">
                      <span className="flex items-center justify-center gap-1.5 text-[--text-muted]">
                        <KalshiLogo size={14} /> Kalshi
                      </span>
                    </th>
                    <th className="text-right px-5 py-3.5 text-[--text-muted] font-medium text-xs uppercase tracking-wider">Gap</th>
                  </tr>
                </thead>
                <tbody>
                  {PREVIEW_MARKETS.map((m, i) => (
                    <motion.tr
                      key={i}
                      initial={{ opacity: 0, x: -10 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.4, delay: i * 0.07, ease: [0.16, 1, 0.3, 1] }}
                      className="border-b border-[--border-subtle] last:border-0 hover:bg-[--surface-hover] transition-colors"
                    >
                      <td className="px-5 py-4">
                        <span className="text-[--text-primary] font-medium">{m.event}</span>
                        <span className="ml-2 text-[--text-muted] text-xs sm:hidden">{m.outcome}</span>
                      </td>
                      <td className="px-4 py-4 text-[--text-secondary] hidden sm:table-cell">{m.outcome}</td>
                      <td className="px-4 py-4 text-center font-mono font-medium text-[#1652F0] dark:text-[#5b8df8]">{m.poly}</td>
                      <td className="px-4 py-4 text-center font-mono font-medium text-[--kalshi-teal]">{m.kalshi}</td>
                      <td className="px-5 py-4 text-right font-mono font-semibold text-[--arb-amber]">{m.gap}</td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── How it works ─────────────────────────────────── */}
      <section className="border-t border-[--border-subtle] py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal>
            <h2 className="text-2xl font-semibold text-[--text-primary] mb-12">How it works</h2>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-12 gap-y-10">
            {[
              {
                n: "01",
                title: "Markets are matched",
                body: "An AI matcher finds equivalent markets on both platforms. \"2026 FIFA World Cup Winner\" on Polymarket corresponds to \"2026 Men's World Cup Winner\" on Kalshi.",
              },
              {
                n: "02",
                title: "Prices are compared",
                body: "For every outcome we pull the current ask price from each platform. Spain at 16.2% on Polymarket vs. 14.1% on Kalshi is a 2.1 percentage point gap.",
              },
              {
                n: "03",
                title: "Gaps surface automatically",
                body: "When the combined cost of YES on one side and NO on the other is less than $1, you have a risk-free arbitrage. The scanner flags these as they appear.",
              },
            ].map((step, i) => (
              <Reveal key={i} delay={i * 0.1}>
                <div>
                  <span className="text-5xl font-bold text-[--border] tabular-nums select-none">{step.n}</span>
                  <h3 className="text-[--text-primary] font-semibold mt-3 mb-2">{step.title}</h3>
                  <p className="text-[--text-secondary] text-sm leading-relaxed">{step.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <Reveal>
          <div className="surface rounded-2xl px-8 py-10 flex flex-col sm:flex-row items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <PolymarketLogo size={20} />
                <span className="text-[--text-muted] text-sm">vs</span>
                <KalshiLogo size={20} />
              </div>
              <h3 className="text-[--text-primary] text-xl font-semibold">Ready to start comparing?</h3>
              <p className="text-[--text-secondary] text-sm mt-1">See which platform has better odds for the markets you care about.</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 shrink-0">
              <Link
                href="/markets"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[--text-primary] text-[--bg] font-semibold text-sm hover:opacity-85 transition-opacity"
              >
                <TrendingUp className="w-4 h-4" />
                Compare Markets
              </Link>
              <Link
                href="/arbitrage"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-[--border] text-[--text-secondary] font-medium text-sm hover:text-[--text-primary] hover:bg-[--surface-hover] transition-colors"
              >
                <Zap className="w-4 h-4 text-[--arb-amber]" />
                Scan for Arb
              </Link>
            </div>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
