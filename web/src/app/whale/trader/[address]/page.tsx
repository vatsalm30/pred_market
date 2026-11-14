import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { getTrader, isAddress } from "@/lib/polyTrader";
import { categoryFromEvent } from "@/lib/csv";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ address: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { address } = await params;
  if (!isAddress(address)) return { title: "Trader not found" };
  const t = await getTrader(address);
  return {
    title: `${t.name} — Polymarket Trader Profile`,
    description: `${t.name}'s Polymarket profit, volume, open positions and recent trades.`,
  };
}

function fmtUsd(v: number): string {
  const sign = v < 0 ? "−" : "";
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${sign}$${(a / 1_000_000).toFixed(2)}M`;
  if (a >= 1000) return `${sign}$${(a / 1000).toFixed(1)}K`;
  return `${sign}$${Math.round(a)}`;
}

function timeAgo(ts: number): string {
  const s = Math.floor(Date.now() / 1000) - ts;
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" }) {
  const color = tone === "good" ? "text-emerald-600 dark:text-emerald-400" : tone === "bad" ? "text-red-500" : "text-(--text-primary)";
  return (
    <div className="surface rounded-2xl p-4">
      <p className="text-xs text-(--text-muted) mb-1">{label}</p>
      <p className={`text-xl font-semibold tabular-nums ${color}`}>{value}</p>
      {sub && <p className="text-xs text-(--text-secondary) mt-1">{sub}</p>}
    </div>
  );
}

export default async function TraderPage({ params }: Props) {
  const { address } = await params;
  if (!isAddress(address)) notFound();
  const t = await getTrader(address);

  const cats = new Map<string, number>();
  for (const title of t.titles) {
    const c = categoryFromEvent(title);
    cats.set(c, (cats.get(c) ?? 0) + 1);
  }
  const catList = [...cats].sort((a, b) => b[1] - a[1]);
  const catTotal = catList.reduce((s, [, n]) => s + n, 0);
  const bigTrades = t.trades.filter((x) => x.usd >= 500).slice(0, 25);
  const tone = (v: number | undefined) => (v === undefined ? undefined : v >= 0 ? "good" : "bad");

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <Link href="/whale/leaderboard" className="inline-flex items-center gap-1.5 text-xs text-(--text-muted) hover:text-(--text-primary) mb-6">
        <ArrowLeft className="w-3.5 h-3.5" /> Top traders
      </Link>

      <div className="flex items-center gap-4 mb-6">
        {t.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={t.image} alt="" width={56} height={56} className="rounded-full" referrerPolicy="no-referrer" />
        ) : (
          <span className="w-14 h-14 rounded-full bg-(--bg-subtle) inline-flex items-center justify-center text-xl text-(--text-muted)">
            {t.name.slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-(--text-primary) truncate">{t.name}</h1>
          <p className="text-xs text-(--text-muted) font-mono truncate">
            {t.address}
            {t.xUsername && <span className="ml-2 font-sans">@{t.xUsername}</span>}
          </p>
          <a href={`https://polymarket.com/profile/${t.address}`} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-(--text-secondary) hover:text-(--text-primary) mt-1">
            View on Polymarket <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Stat label="All-time profit" value={t.allTime ? fmtUsd(t.allTime.pnl) : "—"} tone={tone(t.allTime?.pnl)}
          sub={t.allTime?.rankPnl ? `#${t.allTime.rankPnl.toLocaleString()} on Polymarket` : undefined} />
        <Stat label="Profit, last 30 days" value={t.month ? fmtUsd(t.month.pnl) : "—"} tone={tone(t.month?.pnl)}
          sub={t.month?.rankPnl ? `#${t.month.rankPnl.toLocaleString()} this month` : undefined} />
        <Stat label="All-time volume" value={t.allTime ? fmtUsd(t.allTime.volume) : "—"} />
        <Stat label="Open positions value" value={t.portfolioValue !== null ? fmtUsd(t.portfolioValue) : "—"} />
      </div>

      <div className="grid lg:grid-cols-3 gap-6 mb-8">
        <div className="lg:col-span-2 surface rounded-2xl p-5">
          <h2 className="text-base font-semibold text-(--text-primary) mb-3">Largest open positions</h2>
          {t.positions.length === 0 ? (
            <p className="text-sm text-(--text-muted)">No open positions.</p>
          ) : (
            <ul className="divide-y divide-(--border-subtle)">
              {t.positions.map((p, i) => (
                <li key={i} className="py-2.5 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <a href={`https://polymarket.com/event/${p.slug}`} target="_blank" rel="noopener noreferrer"
                      className="text-sm text-(--text-primary) hover:underline truncate block">{p.title}</a>
                    <p className="text-xs text-(--text-muted)">
                      {p.outcome} · bought at {(p.avgPrice * 100).toFixed(0)}¢, now {(p.curPrice * 100).toFixed(0)}¢
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-mono tabular-nums text-(--text-primary)">{fmtUsd(p.value)}</p>
                    <p className={`text-xs font-mono tabular-nums ${p.pnl >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
                      {p.pnl >= 0 ? "+" : ""}{fmtUsd(p.pnl)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="surface rounded-2xl p-5">
          <h2 className="text-base font-semibold text-(--text-primary) mb-3">What they trade</h2>
          {catTotal === 0 ? (
            <p className="text-sm text-(--text-muted)">No recent activity.</p>
          ) : (
            <ul className="space-y-1.5">
              {catList.map(([c, count]) => (
                <li key={c} className="relative text-sm" title={`${c}: ${count} of ${catTotal} recent markets`}>
                  <div className="absolute inset-y-0 left-0 rounded-[4px] bg-(--bg-subtle)" style={{ width: `${(count / catTotal) * 100}%` }} aria-hidden="true" />
                  <div className="relative flex justify-between px-2 py-1">
                    <span className="text-(--text-primary)">{c}</span>
                    <span className="tabular-nums text-(--text-secondary)">{Math.round((count / catTotal) * 100)}%</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11px] text-(--text-muted) mt-3">Share of their last {catTotal} trades and open positions.</p>
        </div>
      </div>

      <div className="surface rounded-2xl p-5">
        <h2 className="text-base font-semibold text-(--text-primary) mb-3">Recent trades over $500</h2>
        {bigTrades.length === 0 ? (
          <p className="text-sm text-(--text-muted)">No trades over $500 in their last 100.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-(--text-muted) border-b border-(--border-subtle)">
                  <th className="py-2 pr-3 font-medium">When</th>
                  <th className="py-2 pr-3 font-medium">Market</th>
                  <th className="py-2 pr-3 font-medium text-center">Side</th>
                  <th className="py-2 pr-3 font-medium text-right">Amount</th>
                  <th className="py-2 font-medium text-right hidden sm:table-cell">Price</th>
                </tr>
              </thead>
              <tbody>
                {bigTrades.map((x, i) => (
                  <tr key={i} className="border-b border-(--border-subtle) last:border-0">
                    <td className="py-2.5 pr-3 text-xs text-(--text-muted) whitespace-nowrap">{timeAgo(x.ts)}</td>
                    <td className="py-2.5 pr-3 max-w-[260px]">
                      <a href={`https://polymarket.com/event/${x.slug}`} target="_blank" rel="noopener noreferrer"
                        className="text-(--text-primary) hover:underline truncate block">{x.title}</a>
                      <span className="text-xs text-(--text-muted)">{x.outcome}</span>
                    </td>
                    <td className="py-2.5 pr-3 text-center">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${x.side === "BUY" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-red-500/10 text-red-500"}`}>{x.side}</span>
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-(--text-primary)">{fmtUsd(x.usd)}</td>
                    <td className="py-2.5 text-right font-mono tabular-nums text-(--text-secondary) hidden sm:table-cell">{(x.price * 100).toFixed(1)}¢</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-xs text-(--text-muted) mt-6">Data from Polymarket&apos;s public API, refreshed every few minutes. Not financial advice.</p>
    </div>
  );
}
