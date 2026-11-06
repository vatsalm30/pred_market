import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe, tierForPrice } from "@/lib/stripe";
import { provisionKey, syncSubscription } from "@/lib/apikeys";

export const dynamic = "force-dynamic";

async function fulfill(session: Stripe.Checkout.Session) {
  if (session.mode !== "subscription" || session.payment_status !== "paid" || !session.subscription) return;
  const subId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
  const sub = await stripe().subscriptions.retrieve(subId);
  const tier = tierForPrice(sub.items.data[0]?.price.id);
  if (!tier) throw new Error(`subscription ${subId} has an unknown price`);
  await provisionKey({
    sessionId: session.id,
    subscription: subId,
    customer: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    tier,
    status: sub.status,
    livemode: sub.livemode,
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = req.headers.get("stripe-signature");
  if (!secret || !signature) return NextResponse.json({ error: "not configured" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(await req.text(), signature, secret);
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      await fulfill(event.data.object);
      break;
    // Renewals, failed payments, plan changes and cancellations all surface as subscription
    // status changes; the stream service checks the status on every connection.
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object;
      await syncSubscription(sub.id, sub.status, tierForPrice(sub.items.data[0]?.price.id));
      break;
    }
    case "invoice.payment_failed":
    case "charge.dispute.created":
    case "charge.refunded":
    case "radar.early_fraud_warning.created":
      // No automatic action: Stripe moves the subscription to past_due/canceled after retries,
      // which the subscription handler above mirrors. Logged for manual review.
      console.warn(`stripe ${event.type}: ${event.data.object.id}`);
      break;
  }
  return NextResponse.json({ received: true });
}
