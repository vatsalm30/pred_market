"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, BellOff } from "lucide-react";

interface Rule {
  pair_id: string;
  move: number | null;
  gap: number | null;
}

/** Add this market to the signed-in user's watchlist, with optional move and gap alerts. */
export default function WatchPanel({ pairId }: { pairId: string }) {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [rule, setRule] = useState<Rule | null>(null);
  const [move, setMove] = useState<string>("5");
  const [gap, setGap] = useState<string>("2");
  const [useMove, setUseMove] = useState(true);
  const [useGap, setUseGap] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/me/watch", { cache: "no-store" }).then(async (r) => {
      if (r.status === 401) return setSignedIn(false);
      setSignedIn(true);
      const d = await r.json();
      const found = (d.watch as Rule[]).find((w) => w.pair_id === pairId) ?? null;
      setRule(found);
      if (found) {
        setUseMove(found.move !== null);
        setUseGap(found.gap !== null);
        if (found.move !== null) setMove(String(found.move));
        if (found.gap !== null) setGap(String(found.gap));
      }
    }).catch(() => setSignedIn(false));
  }, [pairId]);

  const save = async () => {
    setBusy(true);
    setMsg(null);
    const r = await fetch("/api/me/watch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pair_id: pairId, move: useMove ? Number(move) : null, gap: useGap ? Number(gap) : null }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setMsg(d.error ?? "Couldn't save.");
    setRule((d.watch as Rule[]).find((w) => w.pair_id === pairId) ?? null);
    setMsg("Saved. Alerts go to your email and your Discord webhook, if you've connected one.");
  };

  const remove = async () => {
    setBusy(true);
    await fetch(`/api/me/watch?pair=${encodeURIComponent(pairId)}`, { method: "DELETE" });
    setBusy(false);
    setRule(null);
    setMsg("Removed from your watchlist.");
  };

  if (signedIn === null) return <div className="surface rounded-2xl h-24 animate-pulse" />;

  if (!signedIn) {
    return (
      <div className="surface rounded-2xl p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-(--text-primary) flex items-center gap-2"><Bell className="w-4 h-4" /> Watch this market</h2>
          <p className="text-xs text-(--text-muted) mt-1">Get an email or Discord message when the odds move or a gap opens.</p>
        </div>
        <Link
          href={`/login?next=${encodeURIComponent(typeof window !== "undefined" ? window.location.pathname : "/")}`}
          className="btn-lift px-4 py-2 rounded-lg bg-(--kalshi-teal) text-white text-sm font-medium hover:opacity-90"
        >
          Sign in to watch
        </Link>
      </div>
    );
  }

  const input = "w-16 px-2 py-1 rounded-md bg-(--bg-subtle) border border-(--border) text-(--text-primary) text-sm tabular-nums";
  return (
    <div className="surface rounded-2xl p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-sm font-semibold text-(--text-primary) flex items-center gap-2">
          <Bell className="w-4 h-4" /> {rule ? "On your watchlist" : "Watch this market"}
        </h2>
        {rule && (
          <button onClick={remove} disabled={busy} className="text-xs text-(--text-secondary) hover:text-(--text-primary) inline-flex items-center gap-1">
            <BellOff className="w-3.5 h-3.5" /> Remove
          </button>
        )}
      </div>
      <div className="space-y-2 text-sm text-(--text-secondary)">
        <label className="flex items-center gap-2 flex-wrap">
          <input type="checkbox" checked={useMove} onChange={(e) => setUseMove(e.target.checked)} />
          Alert me when the odds move
          <input type="number" min={1} max={50} step={1} value={move} onChange={(e) => setMove(e.target.value)} className={input} aria-label="Points" disabled={!useMove} />
          points
        </label>
        <label className="flex items-center gap-2 flex-wrap">
          <input type="checkbox" checked={useGap} onChange={(e) => setUseGap(e.target.checked)} />
          Alert me when a gap of at least
          <input type="number" min={0.5} max={50} step={0.5} value={gap} onChange={(e) => setGap(e.target.value)} className={input} aria-label="Percent" disabled={!useGap} />
          % opens
        </label>
      </div>
      <div className="flex items-center gap-3 mt-4">
        <button onClick={save} disabled={busy} className="btn-lift px-4 py-2 rounded-lg bg-(--kalshi-teal) text-white text-sm font-medium hover:opacity-90 disabled:opacity-60">
          {rule ? "Update" : "Add to watchlist"}
        </button>
        <Link href="/dashboard#alerts" className="text-xs text-(--text-secondary) hover:text-(--text-primary) underline">Alert settings</Link>
      </div>
      {msg && <p className="text-xs text-(--text-muted) mt-3" role="status">{msg}</p>}
    </div>
  );
}
