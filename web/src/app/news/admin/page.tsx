"use client";

import { useState } from "react";
import type { NewsStory } from "@/lib/news";

type Status = { type: "success" | "error"; message: string } | null;

function fmtDate(iso: string) {
  const d = new Date(iso + "T00:00:00Z");
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

const EMPTY_FORM = (today: string) => ({ headline: "", commentary: "", url: "", tag: "", date: today });

export default function NewsAdminPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [password, setPassword] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [authError, setAuthError] = useState("");
  const [stories, setStories] = useState<NewsStory[]>([]);
  const [editingStory, setEditingStory] = useState<NewsStory | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM(today));

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    setAuthError("");
    const res = await fetch("/api/news/auth", { method: "POST", headers: { "x-admin-password": password } });
    if (res.status === 401) {
      setAuthError("Wrong password.");
    } else {
      setUnlocked(true);
      const list = await fetch("/api/news", { headers: { "x-admin-password": password } });
      if (list.ok) setStories(await list.json());
    }
  }

  function loadForEdit(story: NewsStory) {
    setForm({ headline: story.headline, commentary: story.commentary, url: story.url, tag: story.tag ?? "", date: story.date });
    setEditingStory(story);
    setStatus(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function clearForm() {
    setForm(EMPTY_FORM(today));
    setEditingStory(null);
    setStatus(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setStatus(null);
    try {
      const payload = editingStory
        ? { ...form, slug: editingStory.slug, createdAt: editingStory.createdAt, ogImage: editingStory.ogImage }
        : form;
      const method = editingStory ? "PUT" : "POST";
      const res = await fetch("/api/news", {
        method,
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Unknown error");

      const msg = editingStory ? `Updated — /news/${data.slug}` : `Saved — /news/${data.slug}`;
      setStatus({ type: "success", message: msg });

      // Refresh list
      const list = await fetch("/api/news", { headers: { "x-admin-password": password } });
      if (list.ok) setStories(await list.json());

      if (!editingStory) clearForm();
    } catch (err) {
      setStatus({ type: "error", message: (err as Error).message });
    } finally {
      setSubmitting(false);
    }
  }

  const inputCls = "w-full px-3 py-2 bg-[--surface] border border-[--border-subtle] rounded-lg text-[--text-primary] text-sm focus:outline-none focus:border-[#00B3A1]";

  if (!unlocked) {
    return (
      <div className="max-w-sm mx-auto px-4 py-20">
        <h1 className="text-xl font-bold text-[--text-primary] mb-6">News Admin</h1>
        <form onSubmit={handleUnlock} className="space-y-4">
          <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} autoFocus />
          {authError && <p className="text-red-500 text-sm">{authError}</p>}
          <button type="submit" className="w-full bg-[#00B3A1] text-white text-sm font-medium py-2 rounded-lg hover:opacity-90 transition-opacity">
            Unlock
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-xl font-bold text-[--text-primary]">
          {editingStory ? "Edit story" : "Add news story"}
        </h1>
        <a href="/news" className="text-sm text-[--text-muted] hover:text-[--text-secondary]">← /news</a>
      </div>

      {/* Form */}
      {editingStory && (
        <div className="flex items-center justify-between mb-5 px-3 py-2 bg-[#00B3A1]/10 border border-[#00B3A1]/30 rounded-lg">
          <p className="text-sm text-[#00B3A1] truncate">Editing: {editingStory.headline}</p>
          <button onClick={clearForm} className="text-xs text-[--text-muted] hover:text-[--text-primary] shrink-0 ml-4">✕ New story</button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-xs text-[--text-muted] mb-1.5">Headline</label>
          <input type="text" required value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} placeholder="e.g. SEC proposes new rules for prediction market platforms" className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-[--text-muted] mb-1.5">Commentary</label>
          <textarea required rows={2} value={form.commentary} onChange={(e) => setForm({ ...form, commentary: e.target.value })} placeholder="One sentence framing this through the lens of arb/liquidity on Kalshi and Polymarket." className={`${inputCls} resize-none`} />
        </div>
        <div>
          <label className="block text-xs text-[--text-muted] mb-1.5">Source URL</label>
          <input type="url" required value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://..." className={inputCls} />
        </div>
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-xs text-[--text-muted] mb-1.5">Tags (comma-separated)</label>
            <input type="text" value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value })} placeholder="Regulation, Polymarket, CFTC…" className={inputCls} />
          </div>
          <div className="w-40">
            <label className="block text-xs text-[--text-muted] mb-1.5">Date</label>
            <input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={inputCls} />
          </div>
        </div>

        {status && (
          <p className={`text-sm ${status.type === "success" ? "text-emerald-500" : "text-red-500"}`}>{status.message}</p>
        )}

        <button type="submit" disabled={submitting} className="bg-[#00B3A1] text-white text-sm font-medium px-6 py-2.5 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50">
          {submitting ? "Saving…" : editingStory ? "Update story" : "Add story"}
        </button>
      </form>

      {/* Existing stories */}
      {stories.length > 0 && (
        <div className="mt-12">
          <p className="text-xs font-medium text-[--text-muted] uppercase tracking-wider mb-4">Existing stories</p>
          <div className="space-y-px">
            {stories.map((s) => (
              <button
                key={s.slug}
                onClick={() => loadForEdit(s)}
                className={`w-full text-left py-3 px-3 rounded-lg border transition-colors ${editingStory?.slug === s.slug ? "border-[#00B3A1]/50 bg-[#00B3A1]/10" : "border-transparent hover:bg-[--surface-hover]"}`}
              >
                <p className="text-sm font-medium text-[--text-primary] truncate">{s.headline}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-[--text-muted]">{fmtDate(s.date)}</span>
                  {s.tag && <span className="text-xs text-[--text-muted] truncate">{s.tag}</span>}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
