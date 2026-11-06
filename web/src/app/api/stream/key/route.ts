import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { revealKey, rotateKey, getKey } from "@/lib/apikeys";

export const dynamic = "force-dynamic";

// GET ?session_id= — the success page polls this until the webhook has issued the key.
// The key is returned once; later calls get { revealed: true }.
export async function GET(req: NextRequest): Promise<NextResponse> {
  const sessionId = req.nextUrl.searchParams.get("session_id");
  if (!sessionId?.startsWith("cs_")) return NextResponse.json({ error: "missing session_id" }, { status: 400 });

  const session = await stripe().checkout.sessions.retrieve(sessionId).catch(() => null);
  if (!session || session.status !== "complete") return NextResponse.json({ status: "pending" });

  const key = await revealKey(sessionId);
  if (key) return NextResponse.json({ status: "ready", key });

  // Nothing parked: either the webhook hasn't landed yet or the key was already shown.
  const subId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
  const created = session.created * 1000;
  if (subId && Date.now() - created < 10 * 60_000) return NextResponse.json({ status: "pending" });
  return NextResponse.json({ status: "revealed" });
}

// POST { api_key } — swap a key for a new one (e.g. if it leaked).
export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.json().catch(() => null);
  const apiKey = typeof body?.api_key === "string" ? body.api_key.trim() : "";
  if (!apiKey || !(await getKey(apiKey))) return NextResponse.json({ error: "unknown API key" }, { status: 404 });
  const key = await rotateKey(apiKey);
  return NextResponse.json({ key });
}
