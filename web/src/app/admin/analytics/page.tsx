import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { analyticsConfigured, getSiteAnalytics, type SiteAnalytics } from "@/lib/cfAnalytics";
import AnalyticsClient from "./AnalyticsClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Site Analytics — OmniPred",
  robots: { index: false },
};

const RANGES = [7, 30] as const;

// Comma-separated list of emails allowed to see site analytics
const isAdmin = (email: string) =>
  (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login?next=/admin/analytics");
  if (!isAdmin(user.email)) notFound();

  const { days: rawDays } = await searchParams;
  const days = RANGES.find((d) => String(d) === rawDays) ?? 7;

  let data: SiteAnalytics | null = null;
  let error: string | null = null;
  if (!analyticsConfigured()) {
    error = "Analytics isn't configured. Set CF_ANALYTICS_TOKEN, CF_ANALYTICS_ZONE_ID and CF_ANALYTICS_ACCOUNT_ID.";
  } else {
    try {
      data = await getSiteAnalytics(days);
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't load analytics.";
    }
  }

  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 sm:pt-16 pb-24">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-(--text-primary)">Site analytics</h1>
          <p className="text-sm text-(--text-secondary) mt-1">omnipred.com traffic from Cloudflare. Days are in UTC.</p>
        </div>
        <nav className="inline-flex rounded-xl surface p-1 text-sm" aria-label="Date range">
          {RANGES.map((d) => (
            <Link
              key={d}
              href={`/admin/analytics?days=${d}`}
              aria-current={d === days ? "page" : undefined}
              className={`px-3 py-1.5 rounded-lg ${d === days ? "bg-(--bg-subtle) text-(--text-primary) font-medium" : "text-(--text-secondary) hover:text-(--text-primary)"}`}
            >
              Last {d} days
            </Link>
          ))}
        </nav>
      </div>

      {error && (
        <p role="alert" className="surface rounded-xl px-4 py-3 text-sm text-(--text-primary)">
          {error}
        </p>
      )}
      {data && <AnalyticsClient data={data} />}
    </section>
  );
}
