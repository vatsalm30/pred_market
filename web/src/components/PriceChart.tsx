"use client";

import { useEffect, useMemo, useRef, useState } from "react";

interface Point {
  t: string; // hour, ISO
  k: number | null;
  p: number | null;
}

const RANGES = [
  { days: 1, label: "24h" },
  { days: 7, label: "7d" },
  { days: 30, label: "30d" },
] as const;

const SERIES = [
  { key: "k" as const, name: "Kalshi", color: "var(--chart-kalshi)" },
  { key: "p" as const, name: "Polymarket", color: "var(--chart-poly)" },
];

const fmtPct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1)}%`);
const fmtTime = (iso: string, days: number) =>
  new Date(iso).toLocaleString(undefined, days <= 1
    ? { hour: "numeric", minute: "2-digit" }
    : { month: "short", day: "numeric", hour: "numeric" });

/** Builds an SVG path, breaking the line wherever a value is missing. */
function linePath(points: Point[], key: "k" | "p", x: (i: number) => number, y: (v: number) => number): string {
  let d = "";
  let pen = false;
  points.forEach((pt, i) => {
    const v = pt[key];
    if (v === null) {
      pen = false;
      return;
    }
    d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    pen = true;
  });
  return d;
}

/**
 * Implied YES probability for one matched pair on both venues over time.
 * Two series, so it has a legend plus direct labels at the line ends; hover shows both values.
 */
export default function PriceChart({ pairId }: { pairId: string }) {
  const [days, setDays] = useState<1 | 7 | 30>(7);
  const [points, setPoints] = useState<Point[] | null>(null);
  const [error, setError] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const [width, setWidth] = useState(640);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/history?pair=${encodeURIComponent(pairId)}&days=${days}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => !cancelled && (setPoints(d.points), setError(false)))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [pairId, days]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const H = 200;
  const pad = { top: 12, right: 76, bottom: 22, left: 38 };
  const innerW = width - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;

  const scale = useMemo(() => {
    const vals = (points ?? []).flatMap((p) => [p.k, p.p]).filter((v): v is number => v !== null);
    if (!vals.length) return { lo: 0, hi: 1 };
    let lo = Math.min(...vals), hi = Math.max(...vals);
    const span = Math.max(0.05, hi - lo);
    lo = Math.max(0, lo - span * 0.15);
    hi = Math.min(1, hi + span * 0.15);
    return { lo, hi };
  }, [points]);

  const n = points?.length ?? 0;
  const x = (i: number) => pad.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => pad.top + (1 - (v - scale.lo) / (scale.hi - scale.lo)) * innerH;
  const ticks = [0, 0.5, 1].map((f) => scale.lo + f * (scale.hi - scale.lo));
  const h = hover !== null && points ? points[hover] : null;
  const last = points?.length ? points[points.length - 1] : null;

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!n) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * width;
    const i = Math.round(((px - pad.left) / innerW) * (n - 1));
    setHover(Math.min(n - 1, Math.max(0, i)));
  };

  return (
    <div className="surface rounded-2xl p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-1">
        <h2 className="text-sm font-semibold text-(--text-primary)">Implied probability (YES)</h2>
        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-lg bg-(--bg-subtle) p-0.5 text-xs" role="group" aria-label="Time range">
            {RANGES.map((r) => (
              <button
                key={r.days}
                onClick={() => setDays(r.days)}
                aria-pressed={days === r.days}
                className={`px-2 py-0.5 rounded-md ${days === r.days ? "bg-(--surface) text-(--text-primary) font-medium" : "text-(--text-secondary) hover:text-(--text-primary)"}`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button onClick={() => setShowTable((s) => !s)} className="text-xs text-(--text-secondary) hover:text-(--text-primary)">
            {showTable ? "Chart" : "Table"}
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-4 text-xs text-(--text-secondary) mb-2">
        {SERIES.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className="w-3 h-0.5 rounded-full" style={{ background: s.color }} aria-hidden="true" />
            {s.name}
          </span>
        ))}
      </div>

      <div ref={box}>
        {error ? (
          <p className="text-sm text-(--text-muted) py-10 text-center">Couldn&apos;t load price history.</p>
        ) : points === null ? (
          <div className="h-[200px] rounded-xl bg-(--bg-subtle) animate-pulse" />
        ) : n < 2 ? (
          <p className="text-sm text-(--text-muted) py-10 text-center">
            Not enough history yet. We record both venues&apos; prices every hour, so the chart fills in over the next few hours.
          </p>
        ) : showTable ? (
          <div className="max-h-[260px] overflow-y-auto">
            <table className="w-full text-sm tabular-nums">
              <thead className="sticky top-0 bg-(--surface)">
                <tr className="text-left text-xs text-(--text-muted)">
                  <th className="py-1.5 pr-3 font-medium">Time</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Kalshi</th>
                  <th className="py-1.5 font-medium text-right">Polymarket</th>
                </tr>
              </thead>
              <tbody className="text-(--text-secondary)">
                {[...points].reverse().map((p) => (
                  <tr key={p.t} className="border-t border-(--border-subtle)">
                    <td className="py-1.5 pr-3 text-(--text-primary)">{fmtTime(p.t, days)}</td>
                    <td className="py-1.5 pr-3 text-right">{fmtPct(p.k)}</td>
                    <td className="py-1.5 text-right">{fmtPct(p.p)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <>
            <div className="h-5 text-xs text-(--text-secondary)" aria-live="polite">
              {h ? (
                <span>
                  <span className="text-(--text-primary) font-medium">{fmtTime(h.t, days)}</span> · Kalshi {fmtPct(h.k)} · Polymarket {fmtPct(h.p)}
                </span>
              ) : (
                <span className="text-(--text-muted)">Hover the chart for exact values</span>
              )}
            </div>
            <svg
              viewBox={`0 0 ${width} ${H}`}
              width="100%"
              height={H}
              onPointerMove={onMove}
              onPointerLeave={() => setHover(null)}
              role="img"
              aria-label={`Kalshi and Polymarket implied probability over the last ${days === 1 ? "24 hours" : `${days} days`}. Latest: Kalshi ${fmtPct(last?.k ?? null)}, Polymarket ${fmtPct(last?.p ?? null)}.`}
              className="touch-none"
            >
              {ticks.map((t) => (
                <g key={t}>
                  <line x1={pad.left} x2={pad.left + innerW} y1={y(t)} y2={y(t)} stroke="var(--border-subtle)" strokeWidth={1} />
                  <text x={pad.left - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill="var(--text-muted)">
                    {Math.round(t * 100)}%
                  </text>
                </g>
              ))}
              <text x={pad.left} y={H - 4} fontSize={10} fill="var(--text-muted)">{fmtTime(points[0].t, days)}</text>
              <text x={pad.left + innerW} y={H - 4} fontSize={10} fill="var(--text-muted)" textAnchor="end">Now</text>

              {SERIES.map((s) => (
                <path key={s.key} d={linePath(points, s.key, x, y)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              ))}

              {/* Direct labels at the latest value, nudged apart when they'd overlap */}
              {(() => {
                const ends = SERIES.map((s) => ({ s, v: last?.[s.key] ?? null })).filter((e) => e.v !== null) as { s: (typeof SERIES)[number]; v: number }[];
                const ys = ends.map((e) => y(e.v));
                if (ys.length === 2 && Math.abs(ys[0] - ys[1]) < 12) {
                  const mid = (ys[0] + ys[1]) / 2;
                  const up = ys[0] <= ys[1] ? 0 : 1;
                  ys[up] = mid - 6;
                  ys[1 - up] = mid + 6;
                }
                return ends.map((e, i) => (
                  <text key={e.s.key} x={pad.left + innerW + 6} y={ys[i] + 3} fontSize={10} fill="var(--text-secondary)">
                    {e.s.name === "Polymarket" ? "Poly" : e.s.name} {fmtPct(e.v)}
                  </text>
                ));
              })()}

              {h && hover !== null && (
                <g pointerEvents="none">
                  <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + innerH} stroke="var(--text-muted)" strokeWidth={1} strokeDasharray="3 3" />
                  {SERIES.map((s) =>
                    h[s.key] !== null ? (
                      <circle key={s.key} cx={x(hover)} cy={y(h[s.key]!)} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
                    ) : null
                  )}
                </g>
              )}
            </svg>
          </>
        )}
      </div>
      <p className="text-[11px] text-(--text-muted) mt-2">
        Midpoint of the YES and NO asks on each venue, recorded hourly. Different values on the two venues can mean a gap, or slightly different rules.
      </p>
    </div>
  );
}
