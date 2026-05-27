"use client";

import { useState } from "react";
import type { BlogPost } from "@/lib/blog";

type Status = { type: "success" | "error"; message: string } | null;

function fmtDate(iso: string) {
  const d = new Date(iso + "T00:00:00Z");
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

const TABLE_PLACEHOLDER = `[
  {
    "market": "Will X happen?",
    "polyPrice": "52¢",
    "kalshiPrice": "48¢",
    "gapPct": "4.0%",
    "net500": "$20"
  }
]`;

const EMPTY_FORM = (today: string) => ({
  title: "",
  body: "",
  tagsRaw: "",
  metaTitle: "",
  metaDescription: "",
  tableRaw: "[]",
  date: today,
});

export default function BlogAdminPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [password, setPassword] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [authError, setAuthError] = useState("");
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [editingPost, setEditingPost] = useState<BlogPost | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM(today));

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    setAuthError("");
    const res = await fetch("/api/blog/auth", { method: "POST", headers: { "x-admin-password": password } });
    if (res.status === 401) {
      setAuthError("Wrong password.");
    } else {
      setUnlocked(true);
      const list = await fetch("/api/blog", { headers: { "x-admin-password": password } });
      if (list.ok) setPosts(await list.json());
    }
  }

  function loadForEdit(post: BlogPost) {
    setForm({
      title: post.title,
      body: post.body,
      tagsRaw: post.tags.join(", "),
      metaTitle: post.metaTitle,
      metaDescription: post.metaDescription,
      tableRaw: JSON.stringify(post.table, null, 2),
      date: post.date,
    });
    setEditingPost(post);
    setStatus(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function clearForm() {
    setForm(EMPTY_FORM(today));
    setEditingPost(null);
    setStatus(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setStatus(null);
    try {
      const payload = {
        title: form.title,
        body: form.body,
        tags: form.tagsRaw,
        metaTitle: form.metaTitle || form.title,
        metaDescription: form.metaDescription || form.body.split(".")[0] + ".",
        table: form.tableRaw,
        date: form.date,
        ...(editingPost ? { slug: editingPost.slug } : {}),
      };

      const method = editingPost ? "PUT" : "POST";
      const res = await fetch("/api/blog", {
        method,
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Unknown error");

      const msg = editingPost ? `Updated — /blog/${data.slug}` : `Saved — /blog/${data.slug}`;
      setStatus({ type: "success", message: msg });

      const list = await fetch("/api/blog", { headers: { "x-admin-password": password } });
      if (list.ok) setPosts(await list.json());

      if (!editingPost) clearForm();
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
        <h1 className="text-xl font-bold text-[--text-primary] mb-6">Blog Admin</h1>
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
          {editingPost ? "Edit post" : "Add blog post"}
        </h1>
        <a href="/blog" className="text-sm text-[--text-muted] hover:text-[--text-secondary]">← /blog</a>
      </div>

      {editingPost && (
        <div className="flex items-center justify-between mb-5 px-3 py-2 bg-[#00B3A1]/10 border border-[#00B3A1]/30 rounded-lg">
          <p className="text-sm text-[#00B3A1] truncate">Editing: {editingPost.title}</p>
          <button onClick={clearForm} className="text-xs text-[--text-muted] hover:text-[--text-primary] shrink-0 ml-4">✕ New post</button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-xs text-[--text-muted] mb-1.5">Title</label>
          <input type="text" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Top Arb Gaps: Trump vs Fed Rate Decision" className={inputCls} />
        </div>

        <div>
          <label className="block text-xs text-[--text-muted] mb-1.5">Body</label>
          <textarea required rows={5} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="Market analysis paragraph…" className={`${inputCls} resize-y`} />
        </div>

        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-xs text-[--text-muted] mb-1.5">Tags (comma-separated)</label>
            <input type="text" value={form.tagsRaw} onChange={(e) => setForm({ ...form, tagsRaw: e.target.value })} placeholder="Polymarket, Kalshi, Arbitrage…" className={inputCls} />
          </div>
          <div className="w-40">
            <label className="block text-xs text-[--text-muted] mb-1.5">Date</label>
            <input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={inputCls} />
          </div>
        </div>

        <div>
          <label className="block text-xs text-[--text-muted] mb-1.5">Meta title <span className="text-[--text-muted] font-normal">(defaults to title)</span></label>
          <input type="text" value={form.metaTitle} onChange={(e) => setForm({ ...form, metaTitle: e.target.value })} placeholder="SEO title…" className={inputCls} />
        </div>

        <div>
          <label className="block text-xs text-[--text-muted] mb-1.5">Meta description <span className="text-[--text-muted] font-normal">(defaults to first sentence)</span></label>
          <textarea rows={2} value={form.metaDescription} onChange={(e) => setForm({ ...form, metaDescription: e.target.value })} placeholder="SEO description…" className={`${inputCls} resize-none`} />
        </div>

        <div>
          <label className="block text-xs text-[--text-muted] mb-1.5">
            Table <span className="text-[--text-muted] font-normal">(JSON array, leave as [] if none)</span>
          </label>
          <textarea
            rows={8}
            value={form.tableRaw}
            onChange={(e) => setForm({ ...form, tableRaw: e.target.value })}
            placeholder={TABLE_PLACEHOLDER}
            className={`${inputCls} resize-y font-mono text-xs`}
          />
        </div>

        {status && (
          <p className={`text-sm ${status.type === "success" ? "text-emerald-500" : "text-red-500"}`}>{status.message}</p>
        )}

        <button type="submit" disabled={submitting} className="bg-[#00B3A1] text-white text-sm font-medium px-6 py-2.5 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50">
          {submitting ? "Saving…" : editingPost ? "Update post" : "Add post"}
        </button>
      </form>

      {/* Existing posts */}
      {posts.length > 0 && (
        <div className="mt-12">
          <p className="text-xs font-medium text-[--text-muted] uppercase tracking-wider mb-4">Existing posts</p>
          <div className="space-y-px">
            {posts.map((p) => (
              <button
                key={p.slug}
                onClick={() => loadForEdit(p)}
                className={`w-full text-left py-3 px-3 rounded-lg border transition-colors ${editingPost?.slug === p.slug ? "border-[#00B3A1]/50 bg-[#00B3A1]/10" : "border-transparent hover:bg-[--surface-hover]"}`}
              >
                <p className="text-sm font-medium text-[--text-primary] truncate">{p.title}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-[--text-muted]">{fmtDate(p.date)}</span>
                  {p.tags.length > 0 && (
                    <span className="text-xs text-[--text-muted] truncate">{p.tags.slice(0, 3).join(", ")}</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
