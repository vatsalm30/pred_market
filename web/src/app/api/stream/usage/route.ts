import { NextRequest, NextResponse } from "next/server";
import { recordUsage, type UsageReport } from "@/lib/usage";
import { touchKeys } from "@/lib/apikeys";

export const dynamic = "force-dynamic";

// POST { reports: UsageReport[] } — the stream service reports per-account usage every minute.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.STREAM_VERIFY_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await req.json().catch(() => null)) as { reports?: UsageReport[] } | null;
  const reports = Array.isArray(body?.reports) ? body.reports.slice(0, 1000) : [];
  const now = new Date().toISOString();

  for (const r of reports) {
    if (typeof r.label !== "string") continue;
    await recordUsage(r);
    if (r.label.startsWith("user:") && Array.isArray(r.key_hashes) && r.key_hashes.length) {
      await touchKeys(r.label.slice(5), r.key_hashes.slice(0, 10), now);
    }
  }
  return NextResponse.json({ ok: true, recorded: reports.length });
}
