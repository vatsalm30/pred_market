"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, Copy, KeyRound, LogOut, Plus, RefreshCw, Trash2 } from "lucide-react";
import { STREAM_URL, REST_URL } from "@/lib/streamLimits";

interface UserKey {
  id: string;
  name: string;
  prefix: string;
  tier: string;
  created: string;
  last_used: string | null;
}

interface DayUsage {
  date: string;
  realtime_s: number;
  rest: number;
  messages: number;
  updates: number;
  connects: number;
}

interface Dashboard {
  user: { name: string; email: string; image: string | null; created: string; providers: string[] };
  tier: string;
  limits: {
    realtimeSecondsPerDay: number;
    digestSeconds: number;
    maxQuotePairs: number;
    maxArbSnapshot: number;
    connectionsPerAccount: number;
    messagesPer10s: number;
    restPerHour: number;
    keysPerAccount: number;
  };
  keys: UserKey[];
  usage: DayUsage[];
  live: { connections: number; mode: string | null; updated: string } | null;
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const fmtMinutes = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function timeAgo(iso: string | null): string {
  if (!iso) return "Never";
  const sec = Math.floor((Date.now() - Date.parse(iso)) / 1000);
  if (sec < 90) return "Just now";
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body;
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="px-3 py-2 rounded-lg bg-(--bg-subtle) text-sm text-(--text-primary) inline-flex items-center gap-1.5 shrink-0"
    >
      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function Stat({ label, value, sub, children }: { label: string; value: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="surface rounded-2xl p-4">
      <p className="text-xs text-(--text-muted) mb-1">{label}</p>
      <p className="text-2xl font-semibold text-(--text-primary) tabular-nums">{value}</p>
      {sub && <p className="text-xs text-(--text-secondary) mt-1">{sub}</p>}
      {children}
    </div>
  );
}

/** Realtime minutes per day: one series, so no legend; hover shows the day's numbers. */
function UsageChart({ usage, limitSeconds }: { usage: DayUsage[]; limitSeconds: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const limitMin = limitSeconds / 60;
  const max = Math.max(limitMin, ...usage.map((d) => d.realtime_s / 60));
  const H = 140;
  const h = hover !== null ? usage[hover] : null;

  return (
    <div className="surface rounded-2xl p-5">
      <div className="flex items-baseline justify-between mb-1 gap-3">
        <h2 className="text-base font-semibold text-(--text-primary)">Realtime minutes per day</h2>
        <button onClick={() => setShowTable((s) => !s)} className="text-xs text-(--text-secondary) hover:text-(--text-primary)">
          {showTable ? "Show chart" : "Show table"}
        </button>
      </div>
      <p className="text-xs text-(--text-muted) mb-4">Last 14 days (UTC). Dashed line: your free daily allowance of {limitMin} minutes.</p>

      {showTable ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="text-left text-xs text-(--text-muted)">
                <th className="py-1.5 pr-3 font-medium">Day</th>
                <th className="py-1.5 pr-3 font-medium text-right">Realtime</th>
                <th className="py-1.5 pr-3 font-medium text-right">Updates</th>
                <th className="py-1.5 pr-3 font-medium text-right">REST</th>
                <th className="py-1.5 pr-3 font-medium text-right">Messages</th>
                <th className="py-1.5 font-medium text-right">Connections</th>
              </tr>
            </thead>
            <tbody className="text-(--text-secondary)">
              {[...usage].reverse().map((d) => (
                <tr key={d.date} className="border-t border-(--border-subtle)">
                  <td className="py-1.5 pr-3 text-(--text-primary)">{d.date}</td>
                  <td className="py-1.5 pr-3 text-right">{fmtMinutes(d.realtime_s)}</td>
                  <td className="py-1.5 pr-3 text-right">{d.updates.toLocaleString()}</td>
                  <td className="py-1.5 pr-3 text-right">{d.rest.toLocaleString()}</td>
                  <td className="py-1.5 pr-3 text-right">{d.messages.toLocaleString()}</td>
                  <td className="py-1.5 text-right">{d.connects.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          {/* tooltip */}
          <div className="h-10 text-xs text-(--text-secondary)" aria-live="polite">
            {h ? (
              <span>
                <span className="text-(--text-primary) font-medium">{fmtDate(h.date + "T00:00:00Z")}</span> · {fmtMinutes(h.realtime_s)} realtime ·{" "}
                {h.updates.toLocaleString()} updates · {h.rest} REST calls
              </span>
            ) : (
              <span className="text-(--text-muted)">Hover a bar for details</span>
            )}
          </div>
          <div className="relative flex items-end gap-[2px]" style={{ height: H }} onMouseLeave={() => setHover(null)}>
            {/* allowance line */}
            <div
              className="absolute left-0 right-0 border-t border-dashed border-(--text-muted) pointer-events-none"
              style={{ bottom: (limitMin / max) * H }}
            />
            {usage.map((d, i) => {
              const barH = Math.max(d.realtime_s > 0 ? 2 : 0, (d.realtime_s / 60 / max) * H);
              return (
                <div
                  key={d.date}
                  className="flex-1 h-full flex items-end justify-center cursor-default"
                  onMouseEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  tabIndex={0}
                  aria-label={`${d.date}: ${fmtMinutes(d.realtime_s)} realtime`}
                >
                  <div
                    className="w-full max-w-6 rounded-t-[4px] transition-opacity"
                    style={{ height: barH, background: "var(--chart-bar)", opacity: hover === null || hover === i ? 1 : 0.45 }}
                  />
                </div>
              );
            })}
          </div>
          <div className="h-px bg-(--border) mt-0" />
          <div className="flex justify-between text-[11px] text-(--text-muted) mt-1.5 tabular-nums">
            <span>{fmtDate(usage[0].date + "T00:00:00Z")}</span>
            <span>Today</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DashboardClient() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<{ key: string; name: string } | null>(null);
  const [keyName, setKeyName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await api("/api/dashboard"));
      setError(null);
    } catch (e) {
      if ((e as Error).message === "sign in required") window.location.href = "/login?next=/dashboard";
      else setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => document.visibilityState === "visible" && load(), 30_000);
    return () => clearInterval(id);
  }, [load]);

  const act = async (id: string, fn: () => Promise<void>) => {
    setBusy(id);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const createKey = () =>
    act("create", async () => {
      const res = await api("/api/dashboard/keys", { method: "POST", body: JSON.stringify({ name: keyName }) });
      setNewKey({ key: res.key, name: res.item.name });
      setKeyName("");
    });

  const rotateKey = (k: UserKey) =>
    act(k.id, async () => {
      const res = await api("/api/dashboard/keys", { method: "POST", body: JSON.stringify({ rotate: k.id }) });
      setNewKey({ key: res.key, name: res.item.name });
    });

  const revokeKey = (k: UserKey) =>
    act(k.id, async () => {
      await api(`/api/dashboard/keys?id=${encodeURIComponent(k.id)}`, { method: "DELETE" });
      setConfirmRevoke(null);
    });

  const signOut = async () => {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.location.href = "/";
  };

  const deleteAccount = async () => {
    setBusy("delete");
    try {
      await api("/api/dashboard/account", { method: "DELETE" });
      window.location.href = "/";
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  };

  if (!data) {
    return (
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-24">
        <p className="text-(--text-secondary)">{error ?? "Loading your dashboard…"}</p>
      </section>
    );
  }

  const { user, limits, keys, usage, live } = data;
  const today = usage[usage.length - 1];
  const realtimeLeft = Math.max(0, limits.realtimeSecondsPerDay - today.realtime_s);
  const usedPct = Math.min(100, (today.realtime_s / limits.realtimeSecondsPerDay) * 100);
  const snippetKey = newKey?.key ?? "YOUR_KEY";

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 sm:pt-16 pb-24 space-y-8">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          {user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.image} alt="" width={48} height={48} className="rounded-full shrink-0" referrerPolicy="no-referrer" />
          ) : (
            <div className="w-12 h-12 rounded-full bg-(--bg-subtle) shrink-0" />
          )}
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-(--text-primary) truncate">{user.name}</h1>
            <p className="text-sm text-(--text-secondary) truncate">
              {user.email} · <span className="text-(--text-primary)">Free beta</span>
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href="/developers#docs" className="px-4 py-2 rounded-lg surface text-sm text-(--text-primary) hover:bg-(--surface-hover)">
            API docs
          </Link>
          <button onClick={signOut} className="px-4 py-2 rounded-lg surface text-sm text-(--text-primary) hover:bg-(--surface-hover) inline-flex items-center gap-2">
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      </header>

      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}

      {/* Today */}
      <section>
        <h2 className="text-sm font-medium text-(--text-muted) uppercase tracking-wider mb-3">Today (UTC)</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat
            label="Realtime left"
            value={fmtMinutes(realtimeLeft)}
            sub={realtimeLeft > 0 ? `of ${limits.realtimeSecondsPerDay / 60} min · then ${limits.digestSeconds}s digests` : `Digest mode until 00:00 UTC`}
          >
            <div className="h-1.5 rounded-full bg-(--bg-subtle) mt-3 overflow-hidden" role="progressbar" aria-valuenow={Math.round(usedPct)} aria-valuemin={0} aria-valuemax={100} aria-label="Realtime used today">
              <div className="h-full rounded-full" style={{ width: `${usedPct}%`, background: "var(--chart-bar)" }} />
            </div>
          </Stat>
          <Stat label="Updates received" value={today.updates.toLocaleString()} sub={`${today.connects} connection${today.connects === 1 ? "" : "s"} opened`} />
          <Stat label="REST requests" value={today.rest.toLocaleString()} sub={`limit ${limits.restPerHour} per hour`} />
          <Stat
            label="Connected now"
            value={live ? String(live.connections) : "0"}
            sub={live && live.connections > 0 ? `${live.mode === "digest" ? "Digest" : "Realtime"} mode · limit ${limits.connectionsPerAccount}` : `limit ${limits.connectionsPerAccount}`}
          />
        </div>
        <p className="text-xs text-(--text-muted) mt-2">Usage is reported by the stream server about once a minute.</p>
      </section>

      <UsageChart usage={usage} limitSeconds={limits.realtimeSecondsPerDay} />

      {/* Keys */}
      <section className="surface rounded-2xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-semibold text-(--text-primary) flex items-center gap-2">
              <KeyRound className="w-4 h-4" /> API keys
            </h2>
            <p className="text-xs text-(--text-muted) mt-0.5">
              {keys.length} of {limits.keysPerAccount}. All keys share your account&apos;s limits.
            </p>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createKey();
            }}
            className="flex gap-2"
          >
            <input
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              placeholder="Key name, e.g. trading bot"
              maxLength={40}
              className="w-full sm:w-56 px-3 py-2 rounded-lg bg-(--bg-subtle) border border-(--border) text-sm text-(--text-primary)"
            />
            <button
              type="submit"
              disabled={busy !== null || keys.length >= limits.keysPerAccount}
              className="px-4 py-2 rounded-lg bg-(--kalshi-teal) text-white text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-50 shrink-0"
            >
              <Plus className="w-4 h-4" /> Create key
            </button>
          </form>
        </div>

        {newKey && (
          <div className="rounded-xl border border-(--kalshi-teal) p-4 mb-4">
            <p className="text-sm text-(--text-primary) font-medium mb-1">New key “{newKey.name}”</p>
            <p className="text-xs text-(--text-secondary) mb-3">Copy it now. For your security we only show it once.</p>
            <div className="flex items-center gap-3">
              <code className="flex-1 font-mono text-sm text-(--text-primary) break-all">{newKey.key}</code>
              <CopyButton value={newKey.key} />
            </div>
          </div>
        )}

        {keys.length === 0 ? (
          <p className="text-sm text-(--text-secondary) py-6 text-center">No keys yet. Create one to start streaming.</p>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-(--text-muted)">
                  <th className="py-2 px-1 font-medium">Name</th>
                  <th className="py-2 px-1 font-medium">Key</th>
                  <th className="py-2 px-1 font-medium">Created</th>
                  <th className="py-2 px-1 font-medium">Last used</th>
                  <th className="py-2 px-1" />
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id} className="border-t border-(--border-subtle)">
                    <td className="py-3 px-1 text-(--text-primary)">{k.name}</td>
                    <td className="py-3 px-1 font-mono text-(--text-secondary) whitespace-nowrap">{k.prefix}…</td>
                    <td className="py-3 px-1 text-(--text-secondary) whitespace-nowrap">{fmtDate(k.created)}</td>
                    <td className="py-3 px-1 text-(--text-secondary) whitespace-nowrap">{timeAgo(k.last_used)}</td>
                    <td className="py-3 px-1 text-right whitespace-nowrap">
                      {confirmRevoke === k.id ? (
                        <span className="inline-flex gap-2 items-center">
                          <span className="text-xs text-(--text-secondary)">Revoke?</span>
                          <button onClick={() => revokeKey(k)} disabled={busy !== null} className="px-2.5 py-1 rounded-md bg-red-600 text-white text-xs">
                            Revoke
                          </button>
                          <button onClick={() => setConfirmRevoke(null)} className="px-2.5 py-1 rounded-md surface text-xs text-(--text-primary)">
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <span className="inline-flex gap-1">
                          <button onClick={() => rotateKey(k)} disabled={busy !== null} title="Replace with a new key" className="p-2 rounded-md hover:bg-(--surface-hover) text-(--text-secondary) disabled:opacity-50" aria-label={`Rotate ${k.name}`}>
                            <RefreshCw className={`w-4 h-4 ${busy === k.id ? "animate-spin" : ""}`} />
                          </button>
                          <button onClick={() => setConfirmRevoke(k.id)} disabled={busy !== null} title="Revoke" className="p-2 rounded-md hover:bg-(--surface-hover) text-(--text-secondary) disabled:opacity-50" aria-label={`Revoke ${k.name}`}>
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Limits */}
        <section className="surface rounded-2xl p-5">
          <h2 className="text-base font-semibold text-(--text-primary) mb-3">Your limits (free beta)</h2>
          <dl className="grid grid-cols-[1fr_auto] gap-y-2 text-sm">
            {[
              ["Realtime streaming", `${limits.realtimeSecondsPerDay / 60} min / day`],
              ["After that", `digest every ${limits.digestSeconds}s`],
              ["Quote pairs per connection", String(limits.maxQuotePairs)],
              ["Arbs per snapshot", `top ${limits.maxArbSnapshot}`],
              ["Concurrent connections", String(limits.connectionsPerAccount)],
              ["Client messages", `${limits.messagesPer10s} / 10s`],
              ["REST requests", `${limits.restPerHour} / hour`],
              ["API keys", String(limits.keysPerAccount)],
            ].map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-(--text-secondary)">{k}</dt>
                <dd className="text-(--text-primary) text-right tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-(--text-muted) mt-3">
            Limits reset at 00:00 UTC. Need more, or something not working? Email{" "}
            <a href="mailto:support@omnipred.com" className="underline hover:text-(--text-primary)">support@omnipred.com</a>.
          </p>
        </section>

        {/* Quick start */}
        <section className="surface rounded-2xl p-5 min-w-0">
          <h2 className="text-base font-semibold text-(--text-primary) mb-3">Quick start</h2>
          <pre className="rounded-xl bg-(--bg-subtle) p-3 text-xs leading-relaxed font-mono text-(--text-secondary) overflow-x-auto whitespace-pre">{`const ws = new WebSocket("${STREAM_URL}?api_key=${snippetKey}");
ws.onopen = () => ws.send(JSON.stringify({
  op: "subscribe", channel: "arbs", min_profit_pct: 1, min_outcome_score: 0.9,
}));
ws.onmessage = (e) => console.log(JSON.parse(e.data));

// pairs to subscribe quotes to:
// GET ${REST_URL}/v1/pairs?api_key=${snippetKey}`}</pre>
        </section>
      </div>

      {/* Account */}
      <section className="surface rounded-2xl p-5">
        <h2 className="text-base font-semibold text-(--text-primary) mb-1">Account</h2>
        <p className="text-sm text-(--text-secondary) mb-4">
          Signed in with {user.providers.map((p) => (p === "google" ? "Google" : "GitHub")).join(" and ")} since {fmtDate(user.created)}.
        </p>
        <div className="rounded-xl border border-(--border) p-4">
          <p className="text-sm text-(--text-primary) font-medium">Delete account</p>
          <p className="text-xs text-(--text-secondary) mb-3">
            Revokes all your keys and permanently deletes your account and usage history. Type <code>delete</code> to confirm.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={confirmDelete}
              onChange={(e) => setConfirmDelete(e.target.value)}
              placeholder="delete"
              className="sm:w-48 px-3 py-2 rounded-lg bg-(--bg-subtle) border border-(--border) text-sm text-(--text-primary)"
            />
            <button
              onClick={deleteAccount}
              disabled={confirmDelete !== "delete" || busy !== null}
              className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium disabled:opacity-40"
            >
              {busy === "delete" ? "Deleting…" : "Delete my account"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
