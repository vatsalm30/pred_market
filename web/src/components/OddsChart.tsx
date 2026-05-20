import type { MatchedMarket } from "@/lib/csv";
import { PolymarketLogo, KalshiLogo } from "@/components/PlatformLogos";

function pct(v: number | undefined): string {
  if (v == null) return "—";
  return (v * 100).toFixed(v < 0.1 ? 1 : 0) + "%";
}

export function BinaryOddsChart({ outcomes }: { outcomes: MatchedMarket[] }) {
  const o = outcomes[0];
  const polyYes   = o.poly_yes_ask   as number | undefined;
  const kalshiYes = o.kalshi_yes_ask as number | undefined;
  if (polyYes == null && kalshiYes == null) return null;

  const rows = [
    { label: "Polymarket", yes: polyYes,   color: "#1652F0", logo: <PolymarketLogo size={13} /> },
    { label: "Kalshi",     yes: kalshiYes, color: "#00B3A1", logo: <KalshiLogo size={13} /> },
  ];

  return (
    <div className="px-5 py-4 border-t border-[--border-subtle] bg-[--bg-subtle] space-y-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-widest text-[--text-muted] font-medium">Odds</span>
        <div className="flex items-center gap-3 text-[10px] text-[--text-muted]">
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-[#1652F0]/80" /> Polymarket</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-[#00B3A1]/80" /> Kalshi</span>
        </div>
      </div>
      {rows.map((row) => {
        if (row.yes == null) return null;
        const yesPct = row.yes * 100;
        const noPct  = (1 - row.yes) * 100;
        return (
          <div key={row.label} className="group/bar">
            <div className="flex items-center gap-2 mb-1">
              {row.logo}
              <span className="text-[11px] text-[--text-secondary]">{row.label}</span>
              <span className="ml-auto font-mono text-[12px] font-semibold" style={{ color: row.color }}>
                {pct(row.yes)} YES
              </span>
            </div>
            <div className="relative h-5 rounded-full bg-[--surface-hover] select-none group-hover/bar:bg-[--border] transition-colors">
              <div
                className={`binary-fill ${row.label === "Polymarket" ? "binary-fill-poly" : "binary-fill-kalshi"} absolute inset-y-0 left-0 rounded-full flex items-center justify-end pr-1.5`}
                style={{ width: `${yesPct}%`, minWidth: "10px", background: row.color + "CC" }}
              >
                {yesPct > 14 && <span className="binary-price text-white/90 text-[10px] font-medium">{pct(row.yes)}</span>}
              </div>
              {noPct > 14 && (
                <span
                  className="absolute inset-y-0 right-0 flex items-center pr-1.5 text-[10px] text-[--text-muted] font-medium"
                  style={{ left: `max(${yesPct}%, 10px)` }}
                >
                  {pct(1 - row.yes)} NO
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function MultiOddsChart({
  outcomes,
  maxOutcomes = 8,
}: {
  outcomes: MatchedMarket[];
  maxOutcomes?: number;
}) {
  const priced = outcomes
    .filter((o) => o.poly_yes_ask != null || o.kalshi_yes_ask != null)
    .sort((a, b) =>
      ((b.poly_yes_ask ?? b.kalshi_yes_ask ?? 0) as number) -
      ((a.poly_yes_ask ?? a.kalshi_yes_ask ?? 0) as number)
    )
    .slice(0, maxOutcomes);

  if (!priced.length) return null;

  const leader = Math.max(
    ...priced.map((o) => Math.max((o.poly_yes_ask as number) ?? 0, (o.kalshi_yes_ask as number) ?? 0))
  );

  return (
    <div className="px-5 py-4 border-t border-[--border-subtle] bg-[--bg-subtle]">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] uppercase tracking-widest text-[--text-muted] font-medium">
          Top outcomes by probability
        </span>
        <div className="flex items-center gap-3 text-[10px] text-[--text-muted]">
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-[#1652F0]/80" /> Poly</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-[#00B3A1]/80" /> Kalshi</span>
        </div>
      </div>
      <div className="space-y-3">
        {priced.map((o, i) => {
          const polyYes   = o.poly_yes_ask   as number | undefined;
          const kalshiYes = o.kalshi_yes_ask as number | undefined;
          const polyW     = polyYes   != null ? (polyYes   / leader) * 100 : 0;
          const kalshiW   = kalshiYes != null ? (kalshiYes / leader) * 100 : 0;
          return (
            <div key={i} className="grid grid-cols-[120px_1fr_56px] items-center gap-2 group/row rounded-lg px-1 py-0.5 -mx-1 hover:bg-[--surface] transition-colors cursor-default">
              <span className="chart-label text-[11px] text-[--text-secondary] truncate">{o.poly_label}</span>
              <div className="flex flex-col gap-0.5">
                <div className="relative h-3 rounded-full bg-[--surface-hover] group-hover/row:bg-[--border] transition-colors">
                  {polyYes != null && (
                    <div className="bar-fill bar-fill-poly absolute inset-y-0 left-0 rounded-full"
                      style={{ width: `${polyW}%`, minWidth: "8px", background: "#1652F0CC" }} />
                  )}
                </div>
                <div className="relative h-3 rounded-full bg-[--surface-hover] group-hover/row:bg-[--border] transition-colors">
                  {kalshiYes != null && (
                    <div className="bar-fill bar-fill-kalshi absolute inset-y-0 left-0 rounded-full"
                      style={{ width: `${kalshiW}%`, minWidth: "8px", background: "#00B3A1CC" }} />
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end gap-0.5">
                <span className="chart-price chart-price-poly text-[10px] font-mono text-[#1652F0] dark:text-[#5b8df8]">{pct(polyYes)}</span>
                <span className="chart-price chart-price-kalshi text-[10px] font-mono text-[--kalshi-teal]">{pct(kalshiYes)}</span>
              </div>
            </div>
          );
        })}
      </div>
      {outcomes.length > maxOutcomes && (
        <p className="text-[10px] text-[--text-muted] mt-3">
          Showing top {maxOutcomes} of {outcomes.length} outcomes
        </p>
      )}
    </div>
  );
}

export function OddsChart({
  outcomes,
  maxOutcomes,
}: {
  outcomes: MatchedMarket[];
  maxOutcomes?: number;
}) {
  const hasPrices = outcomes.some((o) => o.poly_yes_ask != null || o.kalshi_yes_ask != null);
  if (!hasPrices) return null;
  if (outcomes.length <= 2) return <BinaryOddsChart outcomes={outcomes} />;
  return <MultiOddsChart outcomes={outcomes} maxOutcomes={maxOutcomes} />;
}
