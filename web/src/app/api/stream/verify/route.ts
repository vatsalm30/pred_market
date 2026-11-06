import { NextRequest, NextResponse } from "next/server";
import { getKey, isActive } from "@/lib/apikeys";

export const dynamic = "force-dynamic";

// Called by the stream service (ws-proxy) to check a subscriber's key. Shared-secret protected.
export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.STREAM_VERIFY_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const key = req.nextUrl.searchParams.get("key") ?? "";
  const record = key ? await getKey(key) : null;
  if (!record || !isActive(record)) return NextResponse.json({ active: false });
  return NextResponse.json({ active: true, tier: record.tier, label: record.label ?? record.customer });
}
