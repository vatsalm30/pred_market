import { NextRequest, NextResponse } from "next/server";
import { stripe, SITE_URL } from "@/lib/stripe";
import { getKey } from "@/lib/apikeys";

export const dynamic = "force-dynamic";

// POST { api_key } — the API key doubles as the login for Stripe's billing portal
// (change plan, update card, cancel, invoices).
export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.json().catch(() => null);
  const apiKey = typeof body?.api_key === "string" ? body.api_key.trim() : "";
  const record = apiKey ? await getKey(apiKey) : null;
  if (!record) return NextResponse.json({ error: "unknown API key" }, { status: 404 });
  if (!record.customer) return NextResponse.json({ error: "free keys have no billing" }, { status: 400 });

  const portal = await stripe().billingPortal.sessions.create({
    customer: record.customer,
    return_url: `${SITE_URL}/developers`,
  });
  return NextResponse.json({ url: portal.url });
}
