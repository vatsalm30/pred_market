import { NextRequest, NextResponse } from "next/server";
import { checkUnsubscribeToken, getSettings, saveSettings } from "@/lib/alerts";

export const dynamic = "force-dynamic";

async function unsubscribe(req: NextRequest): Promise<boolean> {
  const u = req.nextUrl.searchParams.get("u") ?? "";
  const t = req.nextUrl.searchParams.get("t") ?? "";
  if (!u || !checkUnsubscribeToken(u, t)) return false;
  const s = await getSettings(u);
  if (s?.digest) await saveSettings({ ...s, digest: false, updated: new Date().toISOString() });
  return true;
}

// GET — link in the email footer. POST — one-click unsubscribe from the mail client.
export async function GET(req: NextRequest) {
  const ok = await unsubscribe(req);
  return NextResponse.redirect(new URL(ok ? "/unsubscribed" : "/unsubscribed?error=1", req.url));
}

export async function POST(req: NextRequest) {
  return (await unsubscribe(req)) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Invalid link" }, { status: 400 });
}
