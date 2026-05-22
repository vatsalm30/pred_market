import { NextResponse } from "next/server";
import { getSubscriberIds, getRecentAlerts, getLastScan } from "@/lib/bot";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const [subscribers, recent, lastScan] = await Promise.all([
      getSubscriberIds(),
      getRecentAlerts(25),
      getLastScan(),
    ]);

    // Compute alerts-in-last-24h from the recent list
    const dayAgo = Date.now() - 86_400_000;
    const last24h = recent.filter((a) => Date.parse(a.ts) >= dayAgo).length;

    return NextResponse.json(
      {
        subscriber_count: subscribers.length,
        last_scan: lastScan,
        alerts_last_24h: last24h,
        recent_alerts: recent,
      },
      { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=60" } }
    );
  } catch (e) {
    return NextResponse.json(
      { error: "Could not fetch stats", message: (e as Error).message },
      { status: 500 }
    );
  }
}
