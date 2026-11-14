import { NextRequest, NextResponse } from "next/server";
import { fromStream } from "@/lib/streamAuth";
import { allSettings, saveSettings } from "@/lib/alerts";
import { arbEmbed, postDiscord, type StreamArb } from "@/lib/notify";

export const dynamic = "force-dynamic";

// Workers allow 50 outbound requests per invocation; leave room for the reads and cleanup.
const MAX_WEBHOOKS = 40;

// POST { arbs } — new arbs that have stayed open, fanned out to users' Discord webhooks.
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!fromStream(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { arbs?: StreamArb[] } | null;
  const arbs = Array.isArray(body?.arbs) ? body.arbs.slice(0, 10) : [];
  if (!arbs.length) return NextResponse.json({ ok: true, sent: 0 });

  const subs = (await allSettings()).filter((s) => s.discord_webhook).slice(0, MAX_WEBHOOKS);
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      const mine = arbs.filter((a) => a.net_profit_pct >= s.discord_min_pct);
      if (!mine.length) return;
      const r = await postDiscord(s.discord_webhook!, { embeds: mine.map(arbEmbed) });
      if (r === "ok") sent++;
      if (r === "gone") await saveSettings({ ...s, discord_webhook: null, updated: new Date().toISOString() });
    })
  );
  return NextResponse.json({ ok: true, sent, subscribers: subs.length });
}
