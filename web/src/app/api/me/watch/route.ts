import { NextRequest, NextResponse } from "next/server";
import { requestUser, sameOrigin } from "@/lib/session";
import { listWatch, removeWatch, saveWatch } from "@/lib/alerts";
import { readData } from "@/lib/staticData";

export const dynamic = "force-dynamic";

const num = (v: unknown, min: number, max: number): number | null =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v * 10) / 10)) : null;

export async function GET(req: NextRequest) {
  const user = await requestUser(req);
  if (!user) return NextResponse.json({ error: "sign in required" }, { status: 401 });
  return NextResponse.json({ watch: await listWatch(user.id) });
}

// POST { pair_id, move?: points, gap?: percent } — add or update a watchlist entry
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const user = await requestUser(req);
  if (!user) return NextResponse.json({ error: "sign in required" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const pairId = typeof body.pair_id === "string" ? body.pair_id : "";
  const labels = await readData<Record<string, [string, string, string, string | null]>>("derived/pairs-lite.json");
  const meta = labels[pairId];
  if (!meta) return NextResponse.json({ error: "Unknown market" }, { status: 404 });

  const existing = (await listWatch(user.id)).find((r) => r.pair_id === pairId);
  const move = num(body.move, 1, 50);
  const result = await saveWatch({
    user_id: user.id,
    pair_id: pairId,
    event: meta[0],
    label: meta[1],
    kalshi_market_id: meta[2],
    move,
    gap: num(body.gap, 0.5, 50),
    // A new or changed move threshold is measured from the price when it's next checked
    base: existing && existing.move === move ? existing.base : null,
    last_gap_ts: existing?.last_gap_ts ?? null,
    created: existing?.created ?? new Date().toISOString(),
  });
  if (result === "limit") return NextResponse.json({ error: "Your watchlist is full (25 markets). Remove one first." }, { status: 409 });
  return NextResponse.json({ watch: await listWatch(user.id) });
}

// DELETE ?pair=<pair id>
export async function DELETE(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const user = await requestUser(req);
  if (!user) return NextResponse.json({ error: "sign in required" }, { status: 401 });
  await removeWatch(user.id, req.nextUrl.searchParams.get("pair") ?? "");
  return NextResponse.json({ watch: await listWatch(user.id) });
}
