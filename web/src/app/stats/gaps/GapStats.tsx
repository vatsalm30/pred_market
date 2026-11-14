"use client";

import { useEffect, useState } from "react";

interface TierStats { n: number; sum_s: number; buckets: number[] }
interface Data {
  days: number;
  buckets: string[];
  tiers: Record<string, string>;
  total: Record<string, TierStats>;
  daily: { date: string; n: number }[];
}

const fmtDuration = (s: number) =>
  s < 60 ? `${Math.round(s)}s` : s < 3600 ? `${Math.round(s / 60)}m` : `${(s / 3600).toFixed(1)}h`;

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="surface rounded-2xl p-4">
      <p className="text-xs text-(--text-muted) mb-1">{label}</p>
      <p className="text-2xl font-semibold text-(--text-primary) tabular-nums">{value}</p>
      {sub && <p className="text-xs text-(--text-secondary) mt-1">{sub}</p>}
    </div>
  );
}

export default function GapStats() {
  const [days, setDays] = useState(7);
  const [tier, setTier] = useState("all");
  const [data, setData] = useState<Data | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    fetch(`/api/stats/gaps?days=${days}`).then((r) => r.json()).then(setData).catch(() => setData(null));
  }, [days]);

  if (!data) return <div className="h-80 rounded-2xl bg-(--surface) animate-pulse" />;

  const tiers = Object.keys(data.tiers);
  const pick = tier === "all" ? tiers : [tier];
  const counts = data.buckets.map((_, i) => pick.reduce((s, t) => s + (data.total[t]?.buckets[i] ?? 0), 0));
  const n = pick.reduce((s, t) => s + (data.total[t]?.n ?? 0), 0);
  const sum = pick.reduce((s, t) => s + (data.total[t]?.sum_s ?? 0), 0);
  const underMinute = counts[0] + counts[1];
  const max = Math.max(1, ...counts);
  const H = 180;

  const pill = (active: boolean) =>
    `px-2.5 py-1 rounded-md text-xs ${active ? "bg-(--surface) text-(--text-primary) font-medium" : "text-(--text-secondary) hover:text-(--text-primary)"}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <div className="inline-flex rounded-lg bg-(--bg-subtle) p-0.5" role="group" aria-label="Period">
          {[1, 7, 30].map((d) => (
            <button key={d} onClick={() => setDays(d)} aria-pressed={days === d} className={pill(days === d)}>
              {d === 1 ? "Today" : `${d} days`}
            </button>
          ))}
        </div>
        <div className="inline-flex rounded-lg bg-(--bg-subtle) p-0.5" role="group" aria-label="Gap size">
          <button onClick={() => setTier("all")} aria-pressed={tier === "all"} className={pill(tier === "all")}>All gaps</button>
          {tiers.map((t) => (
            <button key={t} onClick={() => setTier(t)} aria-pressed={tier === t} className={pill(tier === t)}>{data.tiers[t]}</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat label="Gaps opened and closed" value={n.toLocaleString()} sub={days === 1 ? "today (UTC)" : `last ${days} days`} />
        <Stat label="Closed within a minute" value={n ? `${Math.round((underMinute / n) * 100)}%` : "—"} sub="mostly quotes flickering" />
        <Stat label="Average time open" value={n ? fmtDuration(sum / n) : "—"} sub="pulled up by a few long-lived gaps" />
      </div>

      <div className="surface rounded-2xl p-5">
        <div className="flex items-baseline justify-between mb-1 gap-3">
          <h2 className="text-base font-semibold text-(--text-primary)">How long each gap stayed open</h2>
          <button onClick={() => setShowTable((s) => !s)} className="text-xs text-(--text-secondary) hover:text-(--text-primary)">
            {showTable ? "Show chart" : "Show table"}
          </button>
        </div>
        <p className="text-xs text-(--text-muted) mb-4">Number of gaps by lifetime, from first seen to closed.</p>
        {n === 0 ? (
          <p className="text-sm text-(--text-muted) py-10 text-center">No closed gaps recorded for this period yet.</p>
        ) : showTable ? (
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="text-left text-xs text-(--text-muted)">
                <th className="py-1.5 font-medium">Time open</th>
                <th className="py-1.5 font-medium text-right">Gaps</th>
                <th className="py-1.5 font-medium text-right">Share</th>
              </tr>
            </thead>
            <tbody className="text-(--text-secondary)">
              {data.buckets.map((b, i) => (
                <tr key={b} className="border-t border-(--border-subtle)">
                  <td className="py-1.5 text-(--text-primary)">{b}</td>
                  <td className="py-1.5 text-right">{counts[i].toLocaleString()}</td>
                  <td className="py-1.5 text-right">{((counts[i] / n) * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <>
            <div className="h-5 text-xs text-(--text-secondary)" aria-live="polite">
              {hover !== null ? (
                <span><span className="text-(--text-primary) font-medium">{data.buckets[hover]}</span> · {counts[hover].toLocaleString()} gaps ({((counts[hover] / n) * 100).toFixed(1)}%)</span>
              ) : (
                <span className="text-(--text-muted)">Hover a bar for details</span>
              )}
            </div>
            <div className="flex items-end gap-[2px]" style={{ height: H }} onMouseLeave={() => setHover(null)}>
              {counts.map((c, i) => (
                <div
                  key={i}
                  className="flex-1 h-full flex items-end justify-center"
                  onMouseEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  tabIndex={0}
                  aria-label={`${data.buckets[i]}: ${c} gaps`}
                >
                  <div
                    className="w-full max-w-16 rounded-t-[4px] transition-opacity"
                    style={{ height: Math.max(c > 0 ? 2 : 0, (c / max) * H), background: "var(--chart-bar)", opacity: hover === null || hover === i ? 1 : 0.45 }}
                  />
                </div>
              ))}
            </div>
            <div className="h-px bg-(--border)" />
            <div className="flex gap-[2px] mt-1.5">
              {data.buckets.map((b) => (
                <span key={b} className="flex-1 text-center text-[10px] sm:text-[11px] text-(--text-muted)">{b}</span>
              ))}
            </div>
          </>
        )}
      </div>
      <p className="text-xs text-(--text-muted)">
        Counts every gap of 0.5% or more on pairs matched with high confidence, measured by our live stream. Gaps already
        open when the stream restarts are timed from the restart. Use the{" "}
        <a href="/developers" className="underline">Data Stream API</a> to get these events yourself.
      </p>
    </div>
  );
}
