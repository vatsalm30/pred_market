import { NextRequest, NextResponse } from "next/server";
import { stripe, priceForTier, SITE_URL } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.json().catch(() => null);
  const tier = body?.tier;
  if (tier !== "quotes" && tier !== "pro") return NextResponse.json({ error: "unknown tier" }, { status: 400 });

  try {
    const session = await stripe().checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceForTier(tier), quantity: 1 }],
      allow_promotion_codes: true,
      success_url: `${SITE_URL}/developers/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/developers`,
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error("checkout:", (e as Error).message);
    return NextResponse.json({ error: "could not start checkout" }, { status: 500 });
  }
}
