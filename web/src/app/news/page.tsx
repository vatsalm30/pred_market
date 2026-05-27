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
              <div className="flex items-start gap-4">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-[--text-primary] group-hover:text-[--kalshi-teal] transition-colors leading-snug">
                    {story.headline}
                  </p>
                  <p className="text-[--text-secondary] text-sm mt-1 line-clamp-2">
                    {story.commentary}
                  </p>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-[--text-muted] text-xs">{fmtDate(story.date)}</span>
                    <span className="text-[--text-muted] text-xs">{extractDomain(story.url)}</span>
                    {story.tag && story.tag.split(",").map((t) => t.trim()).filter(Boolean).map((t) => (
                      <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-[#00B3A1]/10 border border-[#00B3A1]/30 text-[#00B3A1]">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
                {story.ogImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={story.ogImage}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="w-24 h-16 sm:w-32 sm:h-20 object-cover rounded-md shrink-0 bg-[--surface]"
                  />
                ) : (
                  <span className="text-[--text-muted] text-sm mt-0.5 shrink-0 group-hover:text-[--kalshi-teal] transition-colors">
                    →
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
