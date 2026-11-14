import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Unsubscribed", robots: { index: false } };

export default async function UnsubscribedPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <section className="max-w-md mx-auto px-4 sm:px-6 pt-20 sm:pt-28 pb-24">
      <h1 className="text-2xl font-bold text-(--text-primary) mb-3">{error ? "That link didn't work" : "You're unsubscribed"}</h1>
      <p className="text-(--text-secondary)">
        {error
          ? "The unsubscribe link was invalid or incomplete. You can turn the daily digest off in your dashboard."
          : "You won't get the daily digest anymore. You can turn it back on any time in your dashboard."}
      </p>
      <Link href="/dashboard" className="inline-block mt-6 text-sm underline text-(--text-primary)">Go to your dashboard</Link>
    </section>
  );
}
