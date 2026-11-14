"use client";

import { useMemo, useState } from "react";

const usd = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function Field({ label, suffix, value, onChange, step = 1, min = 0, max }: {
  label: string; suffix?: string; value: string; onChange: (v: string) => void; step?: number; min?: number; max?: number;
}) {
  return (
    <label className="block">
      <span className="text-xs text-(--text-muted)">{label}</span>
      <div className="mt-1 flex items-center rounded-lg bg-(--bg-subtle) border border-(--border) focus-within:border-(--text-muted)">
        <input
          type="number" inputMode="decimal" value={value} step={step} min={min} max={max}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent px-3 py-2 text-(--text-primary) text-sm tabular-nums outline-none"
        />
        {suffix && <span className="pr-3 text-xs text-(--text-muted)">{suffix}</span>}
      </div>
    </label>
  );
}

function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "good" | "bad" }) {
  const color = tone === "good" ? "text-emerald-600 dark:text-emerald-400" : tone === "bad" ? "text-red-500" : "text-(--text-primary)";
  return (
    <div className="flex justify-between gap-4 py-2 border-t border-(--border-subtle) first:border-0">
      <span className="text-sm text-(--text-secondary)">{label}</span>
      <span className={`text-sm tabular-nums ${strong ? "font-semibold" : ""} ${color}`}>{value}</span>
    </div>
  );
}

export default function Calculator() {
  const [kPrice, setK] = useState("44");
  const [pPrice, setP] = useState("51");
  const [contracts, setC] = useState("500");
  const [kRate, setKRate] = useState("7");
  const [pRate, setPRate] = useState("5");
  const [settle, setSettle] = useState("");
  const [now] = useState(() => Date.now());

  const r = useMemo(() => {
    const k = Number(kPrice) / 100, p = Number(pPrice) / 100, c = Math.floor(Number(contracts));
    if (!(k > 0 && k < 1 && p > 0 && p < 1 && c > 0)) return null;
    const kFee = Math.ceil((Number(kRate) / 100) * c * k * (1 - k) * 100) / 100; // Kalshi rounds up per order
    const pFee = Math.round((Number(pRate) / 100) * c * p * (1 - p) * 100) / 100;
    const stake = c * (k + p);
    const cost = stake + kFee + pFee;
    const profit = c - cost;
    const pct = (profit / cost) * 100;
    const days = settle ? (Date.parse(settle) - now) / 86_400_000 : null;
    const annual = days !== null && days > 0 ? (Math.pow(1 + profit / cost, 365 / days) - 1) * 100 : null;
    return { c, stake, kFee, pFee, cost, profit, pct, grossPct: ((c - stake) / stake) * 100, days, annual };
  }, [kPrice, pPrice, contracts, kRate, pRate, settle, now]);

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div className="surface rounded-2xl p-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Kalshi price" suffix="¢" value={kPrice} onChange={setK} step={0.1} max={99.9} />
          <Field label="Polymarket price" suffix="¢" value={pPrice} onChange={setP} step={0.1} max={99.9} />
        </div>
        <p className="text-[11px] text-(--text-muted) -mt-2">Opposite sides of the same question, e.g. YES on Kalshi and NO on Polymarket.</p>
        <Field label="Contracts (same on both venues)" value={contracts} onChange={setC} step={10} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Kalshi fee rate" suffix="%" value={kRate} onChange={setKRate} step={0.25} />
          <Field label="Polymarket fee rate" suffix="%" value={pRate} onChange={setPRate} step={0.25} />
        </div>
        <label className="block">
          <span className="text-xs text-(--text-muted)">Settlement date (optional, for annualized return)</span>
          <input type="date" value={settle} onChange={(e) => setSettle(e.target.value)}
            className="mt-1 w-full rounded-lg bg-(--bg-subtle) border border-(--border) px-3 py-2 text-sm text-(--text-primary)" />
        </label>
      </div>

      <div className="surface rounded-2xl p-5" aria-live="polite">
        {!r ? (
          <p className="text-sm text-(--text-muted)">Enter prices between 0 and 100¢ and at least one contract.</p>
        ) : (
          <>
            <p className="text-xs text-(--text-muted)">Net profit after fees</p>
            <p className={`text-3xl font-bold tabular-nums mb-1 ${r.profit > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
              {usd(r.profit)} <span className="text-lg">({r.pct > 0 ? "+" : ""}{r.pct.toFixed(2)}%)</span>
            </p>
            <p className="text-xs text-(--text-muted) mb-4">
              {r.profit > 0 ? "Profitable if both orders fill at these prices." : "This gap doesn't cover the fees."}
            </p>
            <Row label="Contracts bought (cost)" value={usd(r.stake)} />
            <Row label="Kalshi fee" value={usd(r.kFee)} />
            <Row label="Polymarket fee (est.)" value={usd(r.pFee)} />
            <Row label="Total cost" value={usd(r.cost)} strong />
            <Row label="Guaranteed payout" value={usd(r.c)} />
            <Row label="Gross return before fees" value={`${r.grossPct.toFixed(2)}%`} />
            {r.annual !== null && (
              <Row label={`Annualized (${Math.round(r.days!)} days to settle)`} value={`${r.annual.toFixed(1)}% / yr`} tone={r.annual > 0 ? "good" : "bad"} />
            )}
            {r.days !== null && r.days <= 0 && <p className="text-xs text-(--text-muted) mt-2">Pick a settlement date in the future.</p>}
          </>
        )}
      </div>
    </div>
  );
}
