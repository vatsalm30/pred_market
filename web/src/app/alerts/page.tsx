"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Bell, Clock, Users, Activity, ExternalLink } from "lucide-react";
import { PolymarketLogo, KalshiLogo, TelegramLogo, TelegramPlaneIcon } from "@/components/PlatformLogos";
import type { RecentAlert } from "@/lib/bot";

const TELEGRAM_BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "omnipred_bot";
const TELEGRAM_URL = `https://t.me/${TELEGRAM_BOT_USERNAME}`;

interface BotStats {
  subscriber_count: number;
  last_scan: string | null;
  alerts_last_24h: number;
  recent_alerts: RecentAlert[];
}

function timeAgo(iso: string): string {
  const diff = Date.now() - Date.parse(iso);
  if (isNaN(diff)) return "—";
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

export default function AlertsPage() {
  const [stats, setStats] = useState<BotStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const r = await fetch("/api/telegram/stats", { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = (await r.json()) as BotStats;
      setStats(data);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();

    let id: ReturnType<typeof setInterval> | null = null;

    const start = () => { id = setInterval(load, 30_000); };
    const stop  = () => { if (id) { clearInterval(id); id = null; } };

    const onVisibility = () => {
      if (document.visibilityState === "visible") { load(); start(); }
      else stop();
    };

    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => { stop(); document.removeEventListener("visibilitychange", onVisibility); };
  }, []);

  return (
    <div className="overflow-x-hidden">
      {/* ── Hero ─────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 sm:pt-20 pb-12 sm:pb-16">
        <div className="animate-in">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-[--bg-subtle] mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-[--kalshi-teal] live-dot" />
            <span className="text-[10px] uppercase tracking-widest text-[--text-muted] font-medium">Live · scans every 10 min</span>
          </div>
          <div className="flex items-center gap-3 mb-4">
            <TelegramLogo size={44} />
            <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-[--text-primary]">
              OmniPred Alerts
            </h1>
          </div>
          <p className="text-[--text-secondary] text-base sm:text-xl leading-relaxed max-w-2xl mb-8">
            A Telegram bot that watches Polymarket and Kalshi in real time. The moment a profitable spread appears across both platforms, you get a message.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <a
              href={TELEGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-lift inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#229ED9] hover:bg-[#1a8ec5] text-white font-semibold text-sm transition-colors"
            >
              <TelegramPlaneIcon size={20} className="text-white" />
              Subscribe on Telegram
              <ArrowRight className="w-4 h-4" />
            </a>
            <a
              href="#how"
              className="btn-lift inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl surface text-[--text-secondary] font-medium text-sm hover:text-[--text-primary] transition-colors"
            >
              How it works
            </a>
          </div>
          <p className="text-[11px] text-[--text-muted] mt-4 font-mono">@{TELEGRAM_BOT_USERNAME}</p>
        </div>
      </section>

      {/* ── Stat strip ───────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-10">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <StatCard
            icon={<Users className="w-4 h-4" />}
            label="Subscribers"
            value={loading ? "—" : (stats?.subscriber_count ?? 0).toLocaleString()}
          />
          <StatCard
            icon={<Bell className="w-4 h-4" />}
            label="Alerts in 24h"
            value={loading ? "—" : (stats?.alerts_last_24h ?? 0).toLocaleString()}
          />
          <StatCard
            icon={<Clock className="w-4 h-4" />}
            label="Last scan"
            value={stats?.last_scan ? timeAgo(stats.last_scan) : "—"}
            sub={stats?.last_scan ? new Date(stats.last_scan).toLocaleTimeString() : undefined}
          />
          <StatCard
            icon={<Activity className="w-4 h-4 text-[--kalshi-teal]" />}
            label="Scan interval"
            value="10 min"
            sub="threshold ≥ 2%"
          />
        </div>
      </section>

      {/* ── Recent alerts feed ───────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-semibold text-[--text-primary]">Recent alerts</h2>
          <span className="text-xs text-[--text-muted]">Updates every 30s</span>
        </div>

        {error && (
          <div className="surface rounded-2xl p-6 text-sm text-[--text-secondary]">
            Could not load alert feed: {error}
          </div>
        )}

        {!error && !loading && (stats?.recent_alerts.length ?? 0) === 0 && (
          <div className="surface rounded-2xl p-8 text-center">
            <p className="text-[--text-secondary] text-sm">
              No alerts yet. As soon as the scanner finds an arbitrage spread above 2%, it will appear here.
            </p>
          </div>
        )}

        {stats && stats.recent_alerts.length > 0 && (
          <div className="surface rounded-2xl overflow-hidden">
            <ul className="divide-y divide-[--border-subtle]">
              {stats.recent_alerts.map((a, i) => (
                <li
                  key={`${a.ts}-${i}`}
                  className="animate-in p-4 sm:p-5 hover:bg-[--surface-hover] transition-colors"
                  style={{ animationDelay: `${Math.min(i * 0.03, 0.4)}s` }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-[10px] uppercase tracking-wider text-[--text-muted] font-mono">
                          {timeAgo(a.ts)}
                        </span>
                        <span className="text-[10px] text-[--text-muted]">·</span>
                        <span className="text-xs font-mono font-semibold text-[--arb-amber]">
                          +{a.net_profit_pct.toFixed(2)}%
                        </span>
                      </div>
                      <p className="text-[--text-primary] font-medium text-sm leading-snug truncate">
                        {a.poly_event}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
                        <span className="inline-flex items-center gap-1.5 text-[--text-secondary]">
                          <KalshiLogo size={12} />
                          <span className="text-[--text-muted]">{a.kalshi_leg.toUpperCase()}</span>
                          <span className="truncate max-w-[140px]">{a.kalshi_label}</span>
                          <span className="font-mono text-[--kalshi-teal]">{(a.kalshi_ask * 100).toFixed(1)}¢</span>
                        </span>
                        <span className="inline-flex items-center gap-1.5 text-[--text-secondary]">
                          <PolymarketLogo size={12} />
                          <span className="text-[--text-muted]">{a.poly_leg.toUpperCase()}</span>
                          <span className="truncate max-w-[140px]">{a.poly_label}</span>
                          <span className="font-mono text-[#5b8df8]">{(a.poly_ask * 100).toFixed(1)}¢</span>
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <a
                        href={a.kalshi_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-lg text-[--text-muted] hover:text-[--text-primary] hover:bg-[--bg-subtle] transition-colors"
                        title="Open on Kalshi"
                      >
                        <KalshiLogo size={14} />
                      </a>
                      <a
                        href={a.poly_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-lg text-[--text-muted] hover:text-[--text-primary] hover:bg-[--bg-subtle] transition-colors"
                        title="Open on Polymarket"
                      >
                        <PolymarketLogo size={14} />
                      </a>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* ── How it works ─────────────────────────────────── */}
      <section id="how" className="border-t border-[--border-subtle] py-16 sm:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-semibold text-[--text-primary] mb-10">How it works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-12 gap-y-8">
            {[
              {
                n: "01",
                title: "You hit /start",
                body: "Open the bot in Telegram and send /start. Your chat ID gets added to a subscriber list. Send /stop any time to unsubscribe — no questions asked.",
              },
              {
                n: "02",
                title: "We scan every 10 min",
                body: "A cron job pulls live prices from Polymarket and Kalshi for every matched market pair, then computes arbitrage spreads in real time.",
              },
              {
                n: "03",
                title: "You get pinged",
                body: "When a spread crosses 2% and we haven't already alerted on it in the past 24 hours, your phone buzzes. Top 5 by profit, every cycle.",
              },
            ].map((step, i) => (
              <div key={i}>
                <span className="text-5xl font-bold text-[--border] tabular-nums select-none">{step.n}</span>
                <h3 className="text-[--text-primary] font-semibold mt-3 mb-2">{step.title}</h3>
                <p className="text-[--text-secondary] text-sm leading-relaxed">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Commands reference ───────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h2 className="text-xl font-semibold text-[--text-primary] mb-5">Commands</h2>
        <div className="surface rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <tbody>
              {[
                ["/start", "Subscribe to arbitrage alerts."],
                ["/stop", "Unsubscribe. Bot stops messaging you."],
                ["/status", "Show subscriber count + alert threshold."],
              ].map(([cmd, desc], i) => (
                <tr key={i} className="border-b border-[--border-subtle] last:border-0">
                  <td className="px-5 py-3.5 w-32"><code className="font-mono text-[--text-primary] font-semibold">{cmd}</code></td>
                  <td className="px-5 py-3.5 text-[--text-secondary]">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Bottom CTA ───────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <div className="surface rounded-2xl px-6 sm:px-8 py-8 sm:py-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div>
            <h3 className="text-[--text-primary] text-xl font-semibold mb-1">Don&apos;t miss the next spread</h3>
            <p className="text-[--text-secondary] text-sm">
              Free. No email. No app to install. Cancel with one command.
              <ExternalLink className="inline w-3 h-3 ml-1 align-text-bottom" />
            </p>
          </div>
          <a
            href={TELEGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-lift inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#229ED9] hover:bg-[#1a8ec5] text-white font-semibold text-sm transition-colors shrink-0"
          >
            <TelegramPlaneIcon size={20} className="text-white" />
            Open in Telegram
          </a>
        </div>
      </section>
    </div>
  );
}

function StatCard({
  icon, label, value, sub,
}: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="surface rounded-2xl px-4 sm:px-5 py-4 sm:py-5">
      <div className="flex items-center gap-1.5 text-[--text-muted] mb-1.5">
        {icon}
        <p className="text-[10px] uppercase tracking-widest font-medium">{label}</p>
      </div>
      <p className="text-2xl sm:text-3xl font-bold text-[--text-primary] tabular-nums">{value}</p>
      {sub && <p className="text-[11px] text-[--text-muted] mt-0.5">{sub}</p>}
    </div>
  );
}
