import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPost } from "@/lib/blog";

export const revalidate = 3600;
export const dynamicParams = true;

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) return { title: "Post not found" };
  return {
    title: post.metaTitle,
    description: post.metaDescription,
    openGraph: {
      title: post.metaTitle,
      description: post.metaDescription,
      type: "article",
      publishedTime: post.date,
      tags: post.tags,
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

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.metaDescription,
    datePublished: post.date,
    author: { "@type": "Organization", name: "OmniPred" },
    publisher: { "@type": "Organization", name: "OmniPred", url: "https://omnipred.com" },
    keywords: post.tags.join(", "),
    url: `https://omnipred.com/blog/${post.slug}`,
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Back */}
      <Link
        href="/blog"
        className="inline-flex items-center gap-1.5 text-sm text-[--text-muted] hover:text-[--text-secondary] mb-8 transition-colors"
      >
        ← Market Movements
      </Link>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[--text-primary] leading-snug">{post.title}</h1>
        <div className="flex items-center gap-3 mt-3">
          <span className="text-[--text-muted] text-sm">{fmtDate(post.date)}</span>
          <div className="flex gap-1.5 flex-wrap">
            {post.tags.map((tag) => (
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

      {/* Body */}
      <p className="text-[--text-secondary] leading-relaxed mb-8">{post.body}</p>

      {/* Table */}
      {post.table.length > 0 && (
        <div className="mb-8 overflow-x-auto">
          <table className="w-full text-sm border border-[--border-subtle] rounded-xl overflow-hidden">
            <thead>
              <tr className="bg-[--surface] text-[--text-muted] text-xs uppercase tracking-wide">
                <th className="text-left px-4 py-3 font-medium">Market</th>
                <th className="text-right px-4 py-3 font-medium">Poly</th>
                <th className="text-right px-4 py-3 font-medium">Kalshi</th>
                <th className="text-right px-4 py-3 font-medium">Gap</th>
                <th className="text-right px-4 py-3 font-medium">Net / $500</th>
              </tr>
            </thead>
            <tbody>
              {post.table.map((row, i) => (
                <tr
                  key={i}
                  className={`border-t border-[--border-subtle] ${
                    i % 2 === 1 ? "bg-[--bg-subtle]" : "bg-[--bg]"
                  }`}
                >
                  <td className="px-4 py-3 text-[--text-primary] max-w-[240px] truncate">
                    {row.market}
                  </td>
                  <td className="px-4 py-3 text-right text-[--poly-blue] font-mono">
                    {row.polyPrice}
                  </td>
                  <td className="px-4 py-3 text-right text-[--kalshi-teal] font-mono">
                    {row.kalshiPrice}
                  </td>
                  <td className="px-4 py-3 text-right text-[--arb-amber] font-mono font-medium">
                    {row.gapPct}
                  </td>
                  <td className="px-4 py-3 text-right text-[--text-primary] font-mono">
                    {row.net500}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* CTA */}
      <div className="border-t border-[--border-subtle] pt-8">
        <p className="text-[--text-secondary] text-sm mb-4">
          These gaps update in real time. See all current opportunities in the live scanner.
        </p>
        <Link
          href="/arbitrage"
          className="inline-flex items-center gap-2 bg-[--kalshi-teal] text-white text-sm font-medium px-5 py-2.5 rounded-lg hover:opacity-90 transition-opacity"
        >
          View Live Arbitrage Scanner →
        </Link>
      </div>
    </div>
  );
}
