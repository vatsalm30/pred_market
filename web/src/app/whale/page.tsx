"use client";

import { useEffect, useState, useCallback } from "react";
import type { WhaleTrade } from "@/lib/whale";
import WhaleTabs from "@/components/WhaleTabs";

function timeAgo(ts: number): string {
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function fmtUsd(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}K`;
  return `$${Math.round(v)}`;
}

function shortAddr(addr: string): string {
  if (!addr || addr === "0x???") return "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function WhalePage() {
  const [trades, setTrades] = useState<WhaleTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [, setTick] = useState(0);

  const fetchTrades = useCallback(async () => {
    try {
      const res = await fetch("/api/whale/recent");
      if (res.ok) {
        const data = await res.json();
        setTrades(Array.isArray(data) ? data : []);
        setLastUpdated(new Date());
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTrades();
    const interval = setInterval(fetchTrades, 30_000);
    return () => clearInterval(interval);
  }, [fetchTrades]);

  // Re-render relative times every minute
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  const threshold = parseInt(process.env.NEXT_PUBLIC_WHALE_THRESHOLD_USD ?? "10000");

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-2xl">🐋</span>
          <h1 className="text-2xl font-bold text-(--text-primary)">Whale Tracker</h1>
          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-(--surface) border border-(--border-subtle)">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00B3A1] live-dot" />
            <span className="text-[10px] uppercase tracking-widest text-(--text-muted) font-medium">Live</span>
          </span>
        </div>
        <p className="text-(--text-secondary) text-sm mt-1">
          Large trades on Polymarket — ${(threshold / 1000).toFixed(0)}K+ per transaction, across the top 25 markets by volume.
        </p>
        {lastUpdated && (
          <p className="text-(--text-muted) text-xs mt-1">
            Updated {timeAgo(Math.floor(lastUpdated.getTime() / 1000))}
          </p>
        )}
      </div>

      <WhaleTabs active="/whale" />

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-14 rounded-lg bg-(--surface) animate-pulse" />
          ))}
        </div>
      ) : trades.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-4xl mb-4">🐋</p>
          <p className="text-(--text-secondary) text-sm">No whale trades detected yet.</p>
          <p className="text-(--text-muted) text-xs mt-1">Tracker scans every 5 minutes. Check back shortly.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-(--border-subtle)">
                <th className="text-left px-3 py-3 text-(--text-muted) font-medium text-xs uppercase tracking-wider w-24">Time</th>
                <th className="text-left px-3 py-3 text-(--text-muted) font-medium text-xs uppercase tracking-wider">Market</th>
                <th className="text-left px-3 py-3 text-(--text-muted) font-medium text-xs uppercase tracking-wider hidden sm:table-cell">Outcome</th>
                <th className="text-center px-3 py-3 text-(--text-muted) font-medium text-xs uppercase tracking-wider w-20">Side</th>
                <th className="text-right px-3 py-3 text-(--text-muted) font-medium text-xs uppercase tracking-wider w-28">Amount</th>
                <th className="text-right px-3 py-3 text-(--text-muted) font-medium text-xs uppercase tracking-wider w-20 hidden md:table-cell">Price</th>
                <th className="text-right px-3 py-3 text-(--text-muted) font-medium text-xs uppercase tracking-wider w-28 hidden lg:table-cell">Trader</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => {
                const polyUrl = t.marketSlug
                  ? `https://polymarket.com/event/${t.marketSlug}`
                  : `https://polymarket.com`;
                return (
                  <tr
                    key={t.id}
                    className="border-b border-(--border-subtle) last:border-0 hover:bg-(--surface-hover) transition-colors"
                  >
                    <td className="px-3 py-3.5 text-(--text-muted) text-xs tabular-nums whitespace-nowrap">
                      {timeAgo(t.timestamp)}
                    </td>
                    <td className="px-3 py-3.5 max-w-[180px] sm:max-w-[240px]">
                      <a
                        href={polyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-(--text-primary) font-medium truncate block hover:text-[#00B3A1] transition-colors"
                        title={t.marketTitle}
                      >
                        {t.marketTitle}
                      </a>
                    </td>
                    <td className="px-3 py-3.5 text-(--text-secondary) text-xs hidden sm:table-cell">
                      {t.outcome}
                    </td>
                    <td className="px-3 py-3.5 text-center">
                      <span
                        className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${
                          t.side === "BUY"
                            ? "bg-emerald-500/10 text-emerald-500"
                            : "bg-red-500/10 text-red-500"
                        }`}
                      >
                        {t.side}
                      </span>
                    </td>
                    <td className="px-3 py-3.5 text-right font-mono font-semibold text-(--text-primary) tabular-nums whitespace-nowrap">
                      {fmtUsd(t.usdValue)}
                    </td>
                    <td className="px-3 py-3.5 text-right font-mono text-(--text-secondary) tabular-nums hidden md:table-cell">
                      {(t.price * 100).toFixed(1)}¢
                    </td>
                    <td className="px-3 py-3.5 text-right hidden lg:table-cell">
                      {t.txHash ? (
                        <a
                          href={`https://polygonscan.com/tx/${t.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-xs text-(--text-muted) hover:text-[#00B3A1] transition-colors"
                        >
                          {shortAddr(t.traderAddress)}
                        </a>
                      ) : (
                        <span className="font-mono text-xs text-(--text-muted)">{shortAddr(t.traderAddress)}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-(--text-muted) text-xs mt-6 text-center">
        Data sourced from Polymarket CLOB API. Refreshes every 30 seconds.
      </p>
    </div>
  );
}
