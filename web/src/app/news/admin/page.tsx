"use client";

import { useState } from "react";

type Status = { type: "success" | "error"; message: string } | null;

export default function NewsAdminPage() {
  const [password, setPassword] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [authError, setAuthError] = useState("");
  const [status, setStatus] = useState<Status>(null);
  const [submitting, setSubmitting] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    headline: "",
    commentary: "",
    url: "",
    tag: "",
    date: today,
  });

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    setAuthError("");
    const res = await fetch("/api/news/auth", {
      method: "POST",
      headers: { "x-admin-password": password },
    });
    if (res.status === 401) {
      setAuthError("Wrong password.");
    } else {
      setUnlocked(true);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setStatus(null);
    try {
      const res = await fetch("/api/news", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Unknown error");
      setStatus({ type: "success", message: `Saved — /news/${data.slug}` });
      setForm({ headline: "", commentary: "", url: "", tag: "", date: today });
    } catch (err) {
      setStatus({ type: "error", message: (err as Error).message });
    } finally {
      setSubmitting(false);
    }
  }

  if (!unlocked) {
    return (
      <div className="max-w-sm mx-auto px-4 py-20">
        <h1 className="text-xl font-bold text-[--text-primary] mb-6">News Admin</h1>
        <form onSubmit={handleUnlock} className="space-y-4">
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 bg-[--surface] border border-[--border-subtle] rounded-lg text-[--text-primary] text-sm focus:outline-none focus:border-[--kalshi-teal]"
            autoFocus
          />
          {authError && <p className="text-red-500 text-sm">{authError}</p>}
          <button
            type="submit"
            className="w-full bg-[--kalshi-teal] text-white text-sm font-medium py-2 rounded-lg hover:opacity-90 transition-opacity"
          >
            Unlock
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-xl font-bold text-[--text-primary]">Add news story</h1>
        <a href="/news" className="text-sm text-[--text-muted] hover:text-[--text-secondary]">
          ← /news
        </a>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-xs text-[--text-muted] mb-1.5">Headline</label>
          <input
            type="text"
            required
            value={form.headline}
            onChange={(e) => setForm({ ...form, headline: e.target.value })}
            placeholder="e.g. SEC proposes new rules for prediction market platforms"
            className="w-full px-3 py-2 bg-[--surface] border border-[--border-subtle] rounded-lg text-[--text-primary] text-sm focus:outline-none focus:border-[--kalshi-teal]"
          />
        </div>

        <div>
          <label className="block text-xs text-[--text-muted] mb-1.5">Commentary</label>
          <textarea
            required
            rows={2}
            value={form.commentary}
            onChange={(e) => setForm({ ...form, commentary: e.target.value })}
            placeholder="One sentence framing this through the lens of arb/liquidity on Kalshi and Polymarket."
            className="w-full px-3 py-2 bg-[--surface] border border-[--border-subtle] rounded-lg text-[--text-primary] text-sm focus:outline-none focus:border-[--kalshi-teal] resize-none"
          />
        </div>

        <div>
          <label className="block text-xs text-[--text-muted] mb-1.5">Source URL</label>
          <input
            type="url"
            required
            value={form.url}
            onChange={(e) => setForm({ ...form, url: e.target.value })}
            placeholder="https://..."
            className="w-full px-3 py-2 bg-[--surface] border border-[--border-subtle] rounded-lg text-[--text-primary] text-sm focus:outline-none focus:border-[--kalshi-teal]"
          />
        </div>

        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-xs text-[--text-muted] mb-1.5">Tag (optional)</label>
            <input
              type="text"
              value={form.tag}
              onChange={(e) => setForm({ ...form, tag: e.target.value })}
              placeholder="regulation, liquidity, platform news…"
              className="w-full px-3 py-2 bg-[--surface] border border-[--border-subtle] rounded-lg text-[--text-primary] text-sm focus:outline-none focus:border-[--kalshi-teal]"
            />
          </div>
          <div className="w-40">
            <label className="block text-xs text-[--text-muted] mb-1.5">Date</label>
            <input
              type="date"
              required
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              className="w-full px-3 py-2 bg-[--surface] border border-[--border-subtle] rounded-lg text-[--text-primary] text-sm focus:outline-none focus:border-[--kalshi-teal]"
            />
          </div>
        </div>

        {status && (
          <p className={`text-sm ${status.type === "success" ? "text-emerald-500" : "text-red-500"}`}>
            {status.message}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="bg-[--kalshi-teal] text-white text-sm font-medium px-6 py-2.5 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Add story"}
        </button>
      </form>
    </div>
  );
}
