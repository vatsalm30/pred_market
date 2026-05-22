import type { Metadata } from "next";
import Link from "next/link";
import { getAllPosts } from "@/lib/blog";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Market Movements",
  description:
    "Daily arbitrage gap analysis across Polymarket and Kalshi prediction markets.",
};

function fmtDate(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default async function BlogPage() {
  const posts = await getAllPosts();

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[--text-primary]">Market Movements</h1>
        <p className="text-[--text-secondary] text-sm mt-1">
          Daily arbitrage gap analysis — Polymarket vs Kalshi.
        </p>
      </div>

      {posts.length === 0 ? (
        <p className="text-[--text-muted] text-sm">No posts yet. Check back tomorrow.</p>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="block bg-[--surface] border border-[--border-subtle] rounded-xl p-5 hover:bg-[--surface-hover] transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-semibold text-[--text-primary] leading-snug">
                    {post.title}
                  </p>
                  <p className="text-[--text-secondary] text-sm mt-1.5 line-clamp-2">
                    {post.body.split(".")[0]}.
                  </p>
                  <div className="flex items-center gap-3 mt-3">
                    <span className="text-[--text-muted] text-xs">{fmtDate(post.date)}</span>
                    <div className="flex gap-1.5 flex-wrap">
                      {post.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="text-xs px-2 py-0.5 rounded-full bg-[--kalshi-teal]/10 text-[--kalshi-teal]"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <span className="text-[--text-muted] text-lg mt-0.5 shrink-0">→</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
