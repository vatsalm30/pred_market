"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import EventIcon from "./EventIcon";

interface Mover {
  pair_id: string;
  kalshi_market_id: string;
  event: string;
  label: string;
  icon: string | null;
  from: number;
  to: number;
  change: number;
}

/** Matched markets whose cross-venue probability moved most in 24 hours. */
export default function MoversList({ limit = 5, compact = false }: { limit?: number; compact?: boolean }) {
  const [movers, setMovers] = useState<Mover[] | null>(null);

  useEffect(() => {
    fetch("/api/movers")
      .then((r) => r.json())
      .then((d) => setMovers((d.movers as Mover[]).slice(0, limit)))
      .catch(() => setMovers([]));
  }, [limit]);

  if (movers === null) {
    return (
      <div className="space-y-2">
        {Array.from({ length: Math.min(limit, 5) }).map((_, i) => <div key={i} className="h-14 rounded-xl bg-(--surface) animate-pulse" />)}
      </div>
    );
  }
  if (movers.length === 0) {
    return <p className="text-sm text-(--text-muted)">Movers appear once we have 24 hours of hourly prices. Check back tomorrow.</p>;
  }

  return (
    <ol className="space-y-2">
      {movers.map((m, i) => {
        const up = m.change > 0;
        return (
          <li key={m.pair_id}>
            <Link
              href={`/arb/${encodeURIComponent(m.kalshi_market_id)}`}
              className="surface rounded-xl px-4 py-3 flex items-center gap-3 hover:bg-(--surface-hover) transition-colors"
            >
              {!compact && <span className="text-xs text-(--text-muted) tabular-nums w-5">{i + 1}</span>}
              <EventIcon src={m.icon} alt={m.event} size={32} className="shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-(--text-primary) truncate">{m.label}</p>
                <p className="text-xs text-(--text-muted) truncate">{m.event}</p>
              </div>
              <div className="text-right shrink-0">
                <p className={`text-sm font-semibold tabular-nums inline-flex items-center gap-0.5 ${up ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
                  {up ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                  {up ? "+" : ""}{m.change.toFixed(1)} pts
                </p>
                <p className="text-xs text-(--text-muted) tabular-nums">
                  {(m.from * 100).toFixed(0)}% → {(m.to * 100).toFixed(0)}%
                </p>
              </div>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
