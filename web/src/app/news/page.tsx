import type { Metadata } from "next";
import Link from "next/link";
import { getAllStories, extractDomain } from "@/lib/news";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "News",
  description:
    "Prediction market news and analysis — curated through the lens of arbitrage and liquidity.",
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

export default async function NewsPage() {
  const stories = await getAllStories();

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[--text-primary]">News</h1>
        <p className="text-[--text-secondary] text-sm mt-1">
          Prediction market news — curated through the lens of arb and liquidity.
        </p>
      </div>

      {stories.length === 0 ? (
        <p className="text-[--text-muted] text-sm">No stories yet.</p>
      ) : (
        <div className="space-y-px">
          {stories.map((story) => (
            <Link
              key={story.slug}
              href={`/news/${story.slug}`}
              className="block group py-5 border-b border-[--border-subtle] hover:bg-[--surface-hover] -mx-4 px-4 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-semibold text-[--text-primary] group-hover:text-[--kalshi-teal] transition-colors leading-snug">
                    {story.headline}
                  </p>
                  <p className="text-[--text-secondary] text-sm mt-1 line-clamp-1">
                    {story.commentary}
                  </p>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-[--text-muted] text-xs">{fmtDate(story.date)}</span>
                    <span className="text-[--text-muted] text-xs">{extractDomain(story.url)}</span>
                    {story.tag && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-[--surface] border border-[--border-subtle] text-[--text-muted]">
                        {story.tag}
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-[--text-muted] text-sm mt-0.5 shrink-0 group-hover:text-[--kalshi-teal] transition-colors">
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
