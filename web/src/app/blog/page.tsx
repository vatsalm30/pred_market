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
    month: "short",
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
        <div className="space-y-px">
          {posts.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="block group py-5 border-b border-[--border-subtle] hover:bg-[--surface-hover] -mx-4 px-4 transition-colors"
            >
              <div className="flex items-start gap-4">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-[--text-primary] group-hover:text-[#00B3A1] transition-colors leading-snug">
                    {post.title}
                  </p>
                  <p className="text-[--text-secondary] text-sm mt-1 line-clamp-2">
                    {post.body.split(".")[0]}.
                  </p>
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    <span className="text-[--text-muted] text-xs">{fmtDate(post.date)}</span>
                    {post.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-xs px-2 py-0.5 rounded-full bg-[#00B3A1]/10 border border-[#00B3A1]/30 text-[#00B3A1]"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
                <span className="text-[--text-muted] text-sm mt-0.5 shrink-0 group-hover:text-[#00B3A1] transition-colors">
                  →
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
