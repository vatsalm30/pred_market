import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getStory, extractDomain } from "@/lib/news";

export const revalidate = 3600;
export const dynamicParams = true;

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const story = await getStory(slug);
  if (!story) return { title: "Story not found" };
  return {
    title: story.headline,
    description: story.commentary,
    openGraph: {
      title: story.headline,
      description: story.commentary,
      type: "article",
      publishedTime: story.date,
    },
  };
}

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

export default async function NewsStoryPage({ params }: Props) {
  const { slug } = await params;
  const story = await getStory(slug);
  if (!story) notFound();

  const domain = extractDomain(story.url);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Back */}
      <Link
        href="/news"
        className="inline-flex items-center gap-1.5 text-sm text-[--text-muted] hover:text-[--text-secondary] mb-8 transition-colors"
      >
        ← News
      </Link>

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-[--text-muted] text-sm">{fmtDate(story.date)}</span>
          {story.tag && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-[--surface] border border-[--border-subtle] text-[--text-muted]">
              {story.tag}
            </span>
          )}
        </div>
        <h1 className="text-2xl font-bold text-[--text-primary] leading-snug">
          {story.headline}
        </h1>
      </div>

      {/* Commentary */}
      <p className="text-[--text-secondary] leading-relaxed mb-8">{story.commentary}</p>

      {/* Source link */}
      <a
        href={story.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 bg-[--surface] border border-[--border-subtle] text-[--text-primary] text-sm font-medium px-4 py-2.5 rounded-lg hover:bg-[--surface-hover] transition-colors mb-10"
      >
        Read on {domain}
        <svg className="w-3.5 h-3.5 text-[--text-muted]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
      </a>

      {/* CTA */}
      <div className="border-t border-[--border-subtle] pt-8">
        <p className="text-[--text-secondary] text-sm mb-4">
          See how this affects pricing gaps across Polymarket and Kalshi in real time.
        </p>
        <Link
          href="/arbitrage"
          className="inline-flex items-center gap-2 bg-[--kalshi-teal] text-white text-sm font-medium px-5 py-2.5 rounded-lg hover:opacity-90 transition-opacity"
        >
          Check live arb gaps →
        </Link>
      </div>
    </div>
  );
}
