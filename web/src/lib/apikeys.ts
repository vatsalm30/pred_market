import crypto from "node:crypto";
import { DeleteCommand, GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { db, TABLE, nowSec } from "./db";

// Data stream API keys. Only a hash of each key is stored; the raw key is shown
// to the subscriber once. Items (see db.ts for the table layout):
//   apikey / <sha256(key)>          tier, status, subscription, customer
//   apisub / <subscriptionId>       keyHash of the subscription's current key
//   apireveal / <checkoutSessionId> raw key, held until the success page shows it (ttl)
//   apiemail / <email>              keyHash of a free key (one per email)
//   signupip#<sha256(ip)> / <date>  free signups from an IP that day (ttl; the IP itself is not stored)

export type Tier = "free" | "quotes" | "pro";

export interface ApiKeyRecord {
  tier: Tier;
  status: string; // Stripe subscription status, or "active" for free keys
  label: string;  // stable subscriber id the stream service uses for limits
  subscription?: string;
  customer?: string;
  email?: string;
  livemode: boolean; // test-mode keys only work while the site runs on a test Stripe key
}

const MAX_SIGNUPS_PER_IP_PER_DAY = 3;

// Statuses where Stripe still expects payment, so access continues (past_due = retrying a failed charge).
const ACTIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

const LIVE = /^(sk|rk)_live_/.test(process.env.STRIPE_SECRET_KEY ?? "");

export const isActive = (r: ApiKeyRecord) => ACTIVE_STATUSES.has(r.status) && (r.livemode || !LIVE);

export const hashKey = (key: string) => crypto.createHash("sha256").update(key).digest("hex");

const newKey = () => `opk_${crypto.randomBytes(24).toString("base64url")}`;

export async function getKey(key: string): Promise<ApiKeyRecord | null> {
  const res = await db().send(new GetCommand({ TableName: TABLE, Key: { pk: "apikey", sk: hashKey(key) } }));
  return (res.Item as ApiKeyRecord | undefined) ?? null;
}

/**
 * Issue a key for a new subscription. Idempotent per subscription, since Stripe can
 * deliver the same webhook more than once. The raw key is parked for the success page.
 */
export async function provisionKey(opts: {
  sessionId: string;
  subscription: string;
  customer: string;
  tier: Tier;
  status: string;
  livemode: boolean;
}): Promise<void> {
  const key = newKey();
  const keyHash = hashKey(key);
  try {
    await db().send(
      new PutCommand({
        TableName: TABLE,
        Item: { pk: "apisub", sk: opts.subscription, keyHash },
        ConditionExpression: "attribute_not_exists(pk)",
      })
    );
  } catch (e) {
    if ((e as Error).name === "ConditionalCheckFailedException") return; // already issued
    throw e;
  }
  const record: ApiKeyRecord = {
    tier: opts.tier,
    status: opts.status,
    subscription: opts.subscription,
    customer: opts.customer,
    label: opts.customer,
    livemode: opts.livemode,
  };
  await db().send(new PutCommand({ TableName: TABLE, Item: { pk: "apikey", sk: keyHash, ...record } }));
  await db().send(
    new PutCommand({ TableName: TABLE, Item: { pk: "apireveal", sk: opts.sessionId, key, ttl: nowSec() + 86400 } })
  );
}

/** Hand out a parked key exactly once. */
export async function revealKey(sessionId: string): Promise<string | null> {
  const res = await db().send(
    new DeleteCommand({ TableName: TABLE, Key: { pk: "apireveal", sk: sessionId }, ReturnValues: "ALL_OLD" })
  );
  const item = res.Attributes;
  if (!item || (typeof item.ttl === "number" && item.ttl < nowSec())) return null;
  return item.key as string;
}

/** Mirror a subscription's status and tier onto its key. */
export async function syncSubscription(subscription: string, status: string, tier: Tier | null): Promise<void> {
  const sub = await db().send(new GetCommand({ TableName: TABLE, Key: { pk: "apisub", sk: subscription } }));
  const keyHash = sub.Item?.keyHash as string | undefined;
  if (!keyHash) return;
  await db().send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { pk: "apikey", sk: keyHash },
      UpdateExpression: tier ? "SET #s = :s, tier = :t" : "SET #s = :s",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: tier ? { ":s": status, ":t": tier } : { ":s": status },
      ConditionExpression: "attribute_exists(pk)",
    })
  );
}

/** Replace a key with a new one for the same subscription. Returns the new raw key. */
export async function rotateKey(oldKey: string): Promise<string | null> {
  const oldHash = hashKey(oldKey);
  const record = await getKey(oldKey);
  if (!record) return null;
  const key = newKey();
  const keyHash = hashKey(key);
  await db().send(new PutCommand({ TableName: TABLE, Item: { pk: "apikey", sk: keyHash, ...record } }));
  if (record.subscription) {
    await db().send(new PutCommand({ TableName: TABLE, Item: { pk: "apisub", sk: record.subscription, keyHash } }));
  }
  if (record.email) {
    await db().send(new PutCommand({ TableName: TABLE, Item: { pk: "apiemail", sk: record.email, keyHash } }));
  }
  await db().send(new DeleteCommand({ TableName: TABLE, Key: { pk: "apikey", sk: oldHash } }));
  return key;
}

export type FreeSignupResult = { key: string } | { error: "email_taken" | "ip_limit" };

/** Issue a free-tier key: one per email, a few per IP per day. */
export async function createFreeKey(email: string, ip: string): Promise<FreeSignupResult> {
  const day = new Date().toISOString().slice(0, 10);
  const count = await db().send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { pk: `signupip#${hashKey(ip).slice(0, 32)}`, sk: day },
      UpdateExpression: "ADD n :one SET #ttl = :ttl",
      ExpressionAttributeNames: { "#ttl": "ttl" },
      ExpressionAttributeValues: { ":one": 1, ":ttl": nowSec() + 2 * 86400 },
      ReturnValues: "UPDATED_NEW",
    })
  );
  if (Number(count.Attributes?.n) > MAX_SIGNUPS_PER_IP_PER_DAY) return { error: "ip_limit" };

  const key = newKey();
  const keyHash = hashKey(key);
  try {
    await db().send(
      new PutCommand({
        TableName: TABLE,
        Item: { pk: "apiemail", sk: email, keyHash },
        ConditionExpression: "attribute_not_exists(pk)",
      })
    );
  } catch (e) {
    if ((e as Error).name === "ConditionalCheckFailedException") return { error: "email_taken" };
    throw e;
  }
  const record: ApiKeyRecord = {
    tier: "free",
    status: "active",
    label: `free:${hashKey(email).slice(0, 16)}`,
    email,
    livemode: true,
  };
  await db().send(new PutCommand({ TableName: TABLE, Item: { pk: "apikey", sk: keyHash, ...record } }));
  return { key };
}
