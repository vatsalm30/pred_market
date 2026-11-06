import Stripe from "stripe";
import type { Tier } from "./apikeys";

let _stripe: Stripe | null = null;

export function stripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY not set");
    // Production must take real payments: refuse a sandbox/test key there.
    if (process.env.VERCEL_ENV === "production" && !/^(sk|rk)_live_/.test(key)) {
      throw new Error("production requires a live Stripe key");
    }
    _stripe = new Stripe(key);
  }
  return _stripe;
}

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.omnipred.com";

export function priceForTier(tier: Tier): string {
  const price = tier === "pro" ? process.env.STRIPE_PRICE_PRO : process.env.STRIPE_PRICE_QUOTES;
  if (!price) throw new Error(`Stripe price for ${tier} not set`);
  return price;
}

export function tierForPrice(priceId: string | undefined): Tier | null {
  if (!priceId) return null;
  if (priceId === process.env.STRIPE_PRICE_PRO) return "pro";
  if (priceId === process.env.STRIPE_PRICE_QUOTES) return "quotes";
  return null;
}
