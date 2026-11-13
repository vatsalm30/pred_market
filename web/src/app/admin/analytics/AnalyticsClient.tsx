"use client";

import { useState } from "react";
import type { Ranked, SiteAnalytics } from "@/lib/cfAnalytics";

const fmtNum = (n: number) => n.toLocaleString();
const fmtDay = (date: string) =>
  new Date(date + "T00:00:00Z").toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
const fmtBytes = (b: number) => {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (b >= 1024 && i < units.length - 1) {
    b /= 1024;
    i++;
  }
  return `${b.toFixed(i ? 1 : 0)} ${units[i]}`;
};

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="surface rounded-2xl p-4">
      <p className="text-xs text-(--text-muted) mb-1">{label}</p>
      <p className="text-2xl font-semibold text-(--text-primary) tabular-nums">{value}</p>
      {sub && <p className="text-xs text-(--text-secondary) mt-1">{sub}</p>}
    </div>
  );
}

/** Page views per day: one series, so no legend; hover shows the day's numbers. */
function DailyChart({ data }: { data: SiteAnalytics }) {
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const { daily, hasRum } = data;
  const max = Math.max(1, ...daily.map((d) => d.pageViews));
  const H = 160;
  const h = hover !== null ? daily[hover] : null;

  return (
    <div className="surface rounded-2xl p-5">
      <div className="flex items-baseline justify-between mb-1 gap-3">
        <h2 className="text-base font-semibold text-(--text-primary)">Page views per day</h2>
        <button onClick={() => setShowTable((s) => !s)} className="text-xs text-(--text-secondary) hover:text-(--text-primary)">
          {showTable ? "Show chart" : "Show table"}
        </button>
      </div>
      <p className="text-xs text-(--text-muted) mb-4">
        {hasRum ? "Page loads in real browsers (bots excluded)." : "HTML page requests seen by Cloudflare, including bots."}
      </p>

      {showTable ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="text-left text-xs text-(--text-muted)">
                <th className="py-1.5 pr-3 font-medium">Day</th>
                <th className="py-1.5 pr-3 font-medium text-right">Page views</th>
                {hasRum && <th className="py-1.5 pr-3 font-medium text-right">Visits</th>}
                <th className="py-1.5 font-medium text-right">Requests</th>
              </tr>
            </thead>
            <tbody className="text-(--text-secondary)">
              {[...daily].reverse().map((d) => (
                <tr key={d.date} className="border-t border-(--border-subtle)">
                  <td className="py-1.5 pr-3 text-(--text-primary)">{fmtDay(d.date)}</td>
                  <td className="py-1.5 pr-3 text-right">{fmtNum(d.pageViews)}</td>
                  {hasRum && <td className="py-1.5 pr-3 text-right">{fmtNum(d.visits)}</td>}
                  <td className="py-1.5 text-right">{fmtNum(d.requests)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <div className="h-10 text-xs text-(--text-secondary)" aria-live="polite">
            {h ? (
              <span>
                <span className="text-(--text-primary) font-medium">{fmtDay(h.date)}</span> · {fmtNum(h.pageViews)} page views
                {hasRum && <> · {fmtNum(h.visits)} visits</>} · {fmtNum(h.requests)} requests
              </span>
            ) : (
              <span className="text-(--text-muted)">Hover a bar for details</span>
            )}
          </div>
          <div className="relative flex items-end gap-[2px]" style={{ height: H }} onMouseLeave={() => setHover(null)}>
            {daily.map((d, i) => (
              <div
                key={d.date}
                className="flex-1 h-full flex items-end justify-center cursor-default"
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                tabIndex={0}
                aria-label={`${fmtDay(d.date)}: ${fmtNum(d.pageViews)} page views`}
              >
                <div
                  className="w-full max-w-8 rounded-t-[4px] transition-opacity"
                  style={{
                    height: Math.max(d.pageViews > 0 ? 2 : 0, (d.pageViews / max) * H),
                    background: "var(--chart-bar)",
                    opacity: hover === null || hover === i ? 1 : 0.45,
                  }}
                />
              </div>
            ))}
          </div>
          <div className="h-px bg-(--border)" />
          <div className="flex justify-between text-[11px] text-(--text-muted) mt-1.5 tabular-nums">
            <span>{fmtDay(daily[0].date)}</span>
            <span>Today</span>
          </div>
        </div>
      )}
    </div>
  );
}

/** Top-N list with a proportional bar behind each count. */
function TopList({ title, rows, empty }: { title: string; rows: Ranked[]; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="surface rounded-2xl p-5">
      <h2 className="text-base font-semibold text-(--text-primary) mb-3">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-(--text-muted)">{empty}</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li key={r.label} className="relative text-sm" title={`${r.label}: ${fmtNum(r.count)}`}>
              <div
                className="absolute inset-y-0 left-0 rounded-[4px] bg-(--bg-subtle)"
                style={{ width: `${(r.count / max) * 100}%` }}
                aria-hidden="true"
              />
              <div className="relative flex justify-between gap-3 px-2 py-1">
                <span className="truncate text-(--text-primary)">{r.label}</span>
                <span className="tabular-nums text-(--text-secondary)">{fmtNum(r.count)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function AnalyticsClient({ data }: { data: SiteAnalytics }) {
  const { totals, hasRum } = data;
  const noRum = "Turn on Cloudflare Web Analytics to see this.";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Page views" value={fmtNum(totals.pageViews)} sub={hasRum ? "Real browsers" : "Includes bots"} />
        {hasRum ? (
          <Stat label="Visits" value={fmtNum(totals.visits)} sub="Sessions from another site or direct" />
        ) : (
          <Stat label="Unique visitors" value={fmtNum(totals.uniques)} sub="Distinct IPs, summed per day" />
        )}
        <Stat label="Requests" value={fmtNum(totals.requests)} sub="All files and API calls" />
        <Stat label="Data served" value={fmtBytes(totals.bytes)} sub={`${totals.cachedPct.toFixed(0)}% from Cloudflare's cache`} />
      </div>

      <DailyChart data={data} />

      <div className="grid md:grid-cols-2 gap-4">
        <TopList title="Top pages" rows={data.pages} empty={noRum} />
        <TopList title="Top referrers" rows={data.referrers} empty={noRum} />
        <TopList title={hasRum ? "Countries (page views)" : "Countries (requests)"} rows={data.countries} empty="No traffic yet." />
        <TopList title="Devices" rows={data.devices} empty={noRum} />
      </div>
    </div>
  );
}
