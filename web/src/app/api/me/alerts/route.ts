import { NextRequest, NextResponse } from "next/server";
import { requestUser, sameOrigin } from "@/lib/session";
import { DISCORD_WEBHOOK_RE, getSettings, saveSettings, type AlertSettings } from "@/lib/alerts";
import { emailEnabled, postDiscord } from "@/lib/notify";

export const dynamic = "force-dynamic";

const defaults = (userId: string, email: string): AlertSettings => ({
  user_id: userId, email, discord_webhook: null, discord_min_pct: 2, digest: false, updated: "",
});

// The webhook URL is a credential for the user's channel, so only a hint of it is returned.
const publicView = (s: AlertSettings) => ({
  discord_connected: !!s.discord_webhook,
  discord_hint: s.discord_webhook ? `…${s.discord_webhook.slice(-6)}` : null,
  discord_min_pct: s.discord_min_pct,
  digest: s.digest,
  email: s.email,
  email_available: emailEnabled(),
});

export async function GET(req: NextRequest) {
  const user = await requestUser(req);
  if (!user) return NextResponse.json({ error: "sign in required" }, { status: 401 });
  return NextResponse.json(publicView((await getSettings(user.id)) ?? defaults(user.id, user.email)));
}

// PUT { discord_webhook?: string | null, discord_min_pct?: number, digest?: boolean }
// POST { test: true } — send a test message to the saved Discord webhook
export async function PUT(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const user = await requestUser(req);
  if (!user) return NextResponse.json({ error: "sign in required" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const s = { ...((await getSettings(user.id)) ?? defaults(user.id, user.email)), email: user.email };

  if (body.discord_webhook === null || body.discord_webhook === "") s.discord_webhook = null;
  else if (typeof body.discord_webhook === "string") {
    const url = body.discord_webhook.trim();
    if (!DISCORD_WEBHOOK_RE.test(url)) return NextResponse.json({ error: "That isn't a Discord webhook URL." }, { status: 400 });
    if ((await postDiscord(url, { content: "✅ OmniPred alerts are connected to this channel." })) !== "ok") {
      return NextResponse.json({ error: "Discord didn't accept a message on that webhook. Check the URL." }, { status: 400 });
    }
    s.discord_webhook = url;
  }
  if (typeof body.discord_min_pct === "number" && Number.isFinite(body.discord_min_pct)) {
    s.discord_min_pct = Math.min(50, Math.max(0.5, Math.round(body.discord_min_pct * 10) / 10));
  }
  if (typeof body.digest === "boolean") s.digest = body.digest;
  s.updated = new Date().toISOString();
  await saveSettings(s);
  return NextResponse.json(publicView(s));
}

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const user = await requestUser(req);
  if (!user) return NextResponse.json({ error: "sign in required" }, { status: 401 });
  const s = await getSettings(user.id);
  if (!s?.discord_webhook) return NextResponse.json({ error: "Connect a Discord webhook first." }, { status: 400 });
  const r = await postDiscord(s.discord_webhook, { content: "🔔 Test alert from OmniPred. Real alerts look like the arbitrage cards on the site." });
  return r === "ok" ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Discord rejected the message." }, { status: 502 });
}
