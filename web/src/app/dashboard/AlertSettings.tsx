"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, Trash2 } from "lucide-react";

interface Settings {
  discord_connected: boolean;
  discord_hint: string | null;
  discord_min_pct: number;
  digest: boolean;
  email: string;
  email_available: boolean;
}

interface Rule {
  pair_id: string;
  label: string;
  event: string;
  kalshi_market_id: string;
  move: number | null;
  gap: number | null;
}

async function call(path: string, method: string, body?: unknown) {
  const r = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error ?? `Request failed (${r.status})`);
  return d;
}

/** Discord alerts, the daily digest and the watchlist, in the API dashboard. */
export default function AlertSettings() {
  const [s, setS] = useState<Settings | null>(null);
  const [rules, setRules] = useState<Rule[]>([]);
  const [webhook, setWebhook] = useState("");
  const [minPct, setMinPct] = useState("2");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);

  useEffect(() => {
    Promise.all([call("/api/me/alerts", "GET"), call("/api/me/watch", "GET")])
      .then(([settings, w]) => {
        setS(settings);
        setMinPct(String(settings.discord_min_pct));
        setRules(w.watch);
      })
      .catch(() => setMsg({ text: "Couldn't load your alert settings.", error: true }));
  }, []);

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ text: ok });
    } catch (e) {
      setMsg({ text: (e as Error).message, error: true });
    } finally {
      setBusy(false);
    }
  };

  if (!s) return <div className="surface rounded-2xl h-48 animate-pulse" id="alerts" />;

  const input = "rounded-lg bg-(--bg-subtle) border border-(--border) px-3 py-2 text-sm text-(--text-primary)";
  const btn = "btn-lift px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-60";

  return (
    <section id="alerts" className="space-y-4 scroll-mt-20">
      <h2 className="text-lg font-semibold text-(--text-primary) flex items-center gap-2"><Bell className="w-4 h-4" /> Alerts</h2>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Discord */}
        <div className="surface rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-(--text-primary) mb-1">Discord</h3>
          <p className="text-xs text-(--text-muted) mb-4">
            New gaps that stay open for 30 seconds, are profitable after estimated fees and close on the same date on both
            venues. Also your watchlist alerts and a daily summary.
          </p>
          {s.discord_connected ? (
            <div className="space-y-3">
              <p className="text-sm text-(--text-secondary)">Connected to webhook <span className="font-mono">{s.discord_hint}</span></p>
              <label className="flex items-center gap-2 text-sm text-(--text-secondary)">
                Only gaps of at least
                <input type="number" min={0.5} max={50} step={0.5} value={minPct} onChange={(e) => setMinPct(e.target.value)} className={`${input} w-20 py-1`} />%
              </label>
              <div className="flex flex-wrap gap-2">
                <button disabled={busy} className={`${btn} bg-(--kalshi-teal) text-white`}
                  onClick={() => run(async () => setS(await call("/api/me/alerts", "PUT", { discord_min_pct: Number(minPct) })), "Saved.")}>Save</button>
                <button disabled={busy} className={`${btn} surface text-(--text-primary)`}
                  onClick={() => run(async () => void (await call("/api/me/alerts", "POST", { test: true })), "Test message sent.")}>Send test</button>
                <button disabled={busy} className={`${btn} text-(--text-secondary) hover:text-(--text-primary)`}
                  onClick={() => run(async () => setS(await call("/api/me/alerts", "PUT", { discord_webhook: null })), "Disconnected.")}>Disconnect</button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <input value={webhook} onChange={(e) => setWebhook(e.target.value)} placeholder="https://discord.com/api/webhooks/…" className={`${input} w-full`} aria-label="Discord webhook URL" />
              <button disabled={busy || !webhook} className={`${btn} bg-(--kalshi-teal) text-white`}
                onClick={() => run(async () => { setS(await call("/api/me/alerts", "PUT", { discord_webhook: webhook })); setWebhook(""); }, "Connected. Check your channel for a confirmation message.")}>
                Connect
              </button>
              <p className="text-[11px] text-(--text-muted)">
                In Discord: Server Settings → Integrations → Webhooks → New Webhook, pick a channel, then Copy Webhook URL.
              </p>
            </div>
          )}
        </div>

        {/* Digest */}
        <div className="surface rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-(--text-primary) mb-1">Daily email digest</h3>
          <p className="text-xs text-(--text-muted) mb-4">
            Each morning: the biggest movers of the last 24 hours and the best open gaps after fees. Sent to {s.email}.
          </p>
          <label className="flex items-center gap-3 text-sm text-(--text-secondary)">
            <input type="checkbox" checked={s.digest} disabled={busy}
              onChange={(e) => run(async () => setS(await call("/api/me/alerts", "PUT", { digest: e.target.checked })), e.target.checked ? "Digest turned on." : "Digest turned off.")} />
            Send me the daily digest
          </label>
          {!s.email_available && (
            <p className="text-[11px] text-(--text-muted) mt-3">Email sending is still being set up, so digests and email alerts will start once it&apos;s live. Discord works now.</p>
          )}
        </div>
      </div>

      {/* Watchlist */}
      <div className="surface rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-(--text-primary) mb-1">Watchlist</h3>
        <p className="text-xs text-(--text-muted) mb-3">
          Add markets from any <Link href="/arbitrage" className="underline">market page</Link> with the Watch panel. Alerts go to email and Discord.
        </p>
        {rules.length === 0 ? (
          <p className="text-sm text-(--text-muted)">Nothing on your watchlist yet.</p>
        ) : (
          <ul className="divide-y divide-(--border-subtle)">
            {rules.map((r) => (
              <li key={r.pair_id} className="py-2.5 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <Link href={`/arb/${encodeURIComponent(r.kalshi_market_id)}`} className="text-sm text-(--text-primary) hover:underline truncate block">{r.label}</Link>
                  <p className="text-xs text-(--text-muted) truncate">
                    {r.event} · {[r.move !== null ? `moves ${r.move} pts` : null, r.gap !== null ? `gap ≥ ${r.gap}%` : null].filter(Boolean).join(", ") || "no alerts"}
                  </p>
                </div>
                <button aria-label={`Remove ${r.label}`} disabled={busy} className="p-2 rounded-md hover:bg-(--surface-hover) text-(--text-secondary)"
                  onClick={() => run(async () => setRules((await call(`/api/me/watch?pair=${encodeURIComponent(r.pair_id)}`, "DELETE")).watch), "Removed.")}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {msg && <p role="status" className={`text-sm ${msg.error ? "text-red-500" : "text-(--text-secondary)"}`}>{msg.text}</p>}
    </section>
  );
}
