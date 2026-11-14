import type { Metadata } from "next";
import Link from "next/link";
import WhaleTabs from "@/components/WhaleTabs";
import { getLeaderboard, PERIODS, SORTS, type LeaderRow, type Period, type Sort } from "@/lib/polyLeaderboard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Top Polymarket Traders — Profit & Volume Leaderboard",
  description: "The most profitable and most active Polymarket traders over the last day, week, month and all time.",
};

function fmtUsd(v: number): string {
  const sign = v < 0 ? "−" : "";
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${sign}$${(a / 1_000_000).toFixed(2)}M`;
  if (a >= 1000) return `${sign}$${(a / 1000).toFixed(1)}K`;
  return `${sign}$${Math.round(a)}`;
}

const pick = <T extends string>(v: string | undefined, options: Record<T, string>, fallback: T): T =>
  v && v in options ? (v as T) : fallback;

function Pills<T extends string>({
  label, options, value, href,
}: { label: string; options: Record<T, string>; value: T; href: (v: T) => string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-(--text-muted)">{label}</span>
      <div className="inline-flex rounded-lg surface p-0.5 text-xs">
        {(Object.keys(options) as T[]).map((k) => (
          <Link
            key={k}
            href={href(k)}
            aria-current={k === value ? "true" : undefined}
            className={`px-2.5 py-1 rounded-md ${k === value ? "bg-(--bg-subtle) text-(--text-primary) font-medium" : "text-(--text-secondary) hover:text-(--text-primary)"}`}
          >
            {options[k]}
          </Link>
        ))}
      </div>
    </div>
  );
}

export default async function LeaderboardPage({ searchParams }: { searchParams: Promise<{ period?: string; sort?: string }> }) {
  const sp = await searchParams;
  const period = pick<Period>(sp.period, PERIODS, "WEEK");
  const sort = pick<Sort>(sp.sort, SORTS, "PNL");
  const href = (p: Period, s: Sort) => `/whale/leaderboard?period=${p}&sort=${s}`;

  let rows: LeaderRow[] = [];
  let error = false;
  try {
    rows = await getLeaderboard(period, sort);
  } catch {
    error = true;
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-2xl">🐋</span>
          <h1 className="text-2xl font-bold text-(--text-primary)">Top Polymarket traders</h1>
        </div>
        <p className="text-(--text-secondary) text-sm">
          Ranked by {SORTS[sort].toLowerCase()} over the {period === "ALL" ? "lifetime of the account" : `last ${PERIODS[period]}`}, from
          Polymarket&apos;s public leaderboard. Updates every few minutes.
        </p>
      </div>

      <WhaleTabs active="/whale/leaderboard" />

      <div className="flex flex-wrap gap-4 mb-5">
        <Pills label="Period" options={PERIODS} value={period} href={(p) => href(p, sort)} />
        <Pills label="Rank by" options={SORTS} value={sort} href={(s) => href(period, s)} />
      </div>

      {error ? (
        <p role="alert" className="surface rounded-xl px-4 py-3 text-sm text-(--text-primary)">
          Polymarket&apos;s leaderboard isn&apos;t responding right now. Please try again in a minute.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-(--border-subtle)">
                <th className="text-left px-3 py-3 text-(--text-muted) font-medium text-xs uppercase tracking-wider w-14">Rank</th>
                <th className="text-left px-3 py-3 text-(--text-muted) font-medium text-xs uppercase tracking-wider">Trader</th>
                <th className="text-right px-3 py-3 text-(--text-muted) font-medium text-xs uppercase tracking-wider w-32">Profit</th>
                <th className="text-right px-3 py-3 text-(--text-muted) font-medium text-xs uppercase tracking-wider w-32 hidden sm:table-cell">Volume</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.address} className="border-b border-(--border-subtle) last:border-0 hover:bg-(--surface-hover) transition-colors">
                  <td className="px-3 py-3 text-(--text-muted) tabular-nums">{r.rank}</td>
                  <td className="px-3 py-3 max-w-[220px] sm:max-w-none">
                    <Link
                      href={`/whale/trader/${r.address}`}
                      className="inline-flex items-center gap-2 text-(--text-primary) font-medium hover:text-[#00B3A1] transition-colors"
                    >
                      {r.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.image} alt="" width={24} height={24} className="rounded-full" referrerPolicy="no-referrer" />
                      ) : (
                        <span className="w-6 h-6 rounded-full bg-(--bg-subtle) inline-flex items-center justify-center text-[10px] text-(--text-muted)">
                          {r.name.slice(0, 1).toUpperCase()}
                        </span>
                      )}
                      <span className="truncate">{r.name}</span>
                    </Link>
                    {r.xUsername && <span className="ml-2 text-xs text-(--text-muted)">@{r.xUsername}</span>}
                  </td>
                  <td className={`px-3 py-3 text-right font-mono font-semibold tabular-nums whitespace-nowrap ${r.pnl >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                    {fmtUsd(r.pnl)}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-(--text-secondary) tabular-nums whitespace-nowrap hidden sm:table-cell">
                    {r.volume > 0 ? fmtUsd(r.volume) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p className="text-sm text-(--text-muted) py-8 text-center">No traders on this leaderboard yet.</p>}
        </div>
      )}
      <p className="text-xs text-(--text-muted) mt-6">
        Profit and volume are as reported by Polymarket. Past results don&apos;t predict future ones.
      </p>
    </div>
  );
}
