/**
 * One-time setup of live-mode Stripe for the data stream, then stores the
 * results in Vercel's production env. Safe to re-run: prices are found by
 * lookup key and the webhook endpoint is only created if missing.
 *
 * Reads the live restricted key from ~/.omnipred_stripe_live_key so it never
 * appears on the command line. The key needs: Products write, Prices write,
 * Customer portal write, Webhook Endpoints write, Checkout Sessions write,
 * Subscriptions read.
 *
 * Usage (from web/): node scripts/stripe-live-setup.mjs
 */

import { readFileSync } from "fs";
import { homedir } from "os";
import { spawnSync } from "child_process";
import Stripe from "stripe";

const SITE = "https://www.omnipred.com";
const WEBHOOK_URL = `${SITE}/api/stripe/webhook`;
const WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
  "charge.dispute.created",
  "charge.refunded",
  "radar.early_fraud_warning.created",
];
const PLANS = [
  { env: "STRIPE_PRICE_QUOTES", lookup: "stream_quotes_monthly", amount: 1900,
    name: "OmniPred Data Stream - Quotes", description: "Live top-of-book quotes for matched Kalshi and Polymarket markets" },
  { env: "STRIPE_PRICE_PRO", lookup: "stream_pro_monthly", amount: 7900,
    name: "OmniPred Data Stream - Pro", description: "Live quotes plus the cross-venue arbitrage stream" },
];

const key = readFileSync(`${homedir()}/.omnipred_stripe_live_key`, "utf8").trim();
if (!/^(rk|sk)_live_/.test(key)) throw new Error("~/.omnipred_stripe_live_key must hold a live key (rk_live_...)");
const stripe = new Stripe(key);

/** Set a Vercel production env var, replacing any existing value. Values go over stdin. */
function setEnv(name, value) {
  spawnSync("vercel", ["env", "rm", name, "production", "-y"], { stdio: "ignore" });
  const res = spawnSync("vercel", ["env", "add", name, "production"], { input: value, stdio: ["pipe", "ignore", "pipe"] });
  if (res.status !== 0) throw new Error(`vercel env add ${name} failed: ${res.stderr}`);
  console.log(`vercel: set ${name}`);
}

const prices = {};
for (const plan of PLANS) {
  const existing = await stripe.prices.list({ lookup_keys: [plan.lookup], active: true, expand: ["data.product"] });
  let price = existing.data[0];
  if (!price) {
    const product = await stripe.products.create({ name: plan.name, description: plan.description });
    price = await stripe.prices.create({
      product: product.id,
      unit_amount: plan.amount,
      currency: "usd",
      recurring: { interval: "month" },
      lookup_key: plan.lookup,
    });
    console.log(`created ${plan.name}: ${price.id}`);
  } else {
    console.log(`found ${plan.name}: ${price.id}`);
  }
  prices[plan.env] = price;
}

const portal = await stripe.billingPortal.configurations.create({
  business_profile: { headline: "OmniPred Data Stream" },
  default_return_url: `${SITE}/developers`,
  features: {
    invoice_history: { enabled: true },
    payment_method_update: { enabled: true },
    subscription_cancel: { enabled: true, mode: "at_period_end" },
    subscription_update: {
      enabled: true,
      default_allowed_updates: ["price"],
      proration_behavior: "create_prorations",
      products: Object.values(prices).map((p) => ({
        product: typeof p.product === "string" ? p.product : p.product.id,
        prices: [p.id],
      })),
    },
  },
});
console.log(`billing portal config: ${portal.id}${portal.is_default ? " (default)" : ""}`);

// The signing secret is only returned when an endpoint is created.
const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
let webhookSecret = null;
if (!endpoints.data.some((e) => e.url === WEBHOOK_URL)) {
  const endpoint = await stripe.webhookEndpoints.create({ url: WEBHOOK_URL, enabled_events: WEBHOOK_EVENTS });
  webhookSecret = endpoint.secret;
  console.log(`created webhook endpoint ${endpoint.id}`);
} else {
  console.log("webhook endpoint already exists — keeping the STRIPE_WEBHOOK_SECRET already in Vercel");
}

setEnv("STRIPE_SECRET_KEY", key);
for (const plan of PLANS) setEnv(plan.env, prices[plan.env].id);
if (webhookSecret) setEnv("STRIPE_WEBHOOK_SECRET", webhookSecret);
console.log("done");
