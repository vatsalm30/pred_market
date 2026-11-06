import crypto from "node:crypto";
import { DeleteCommand, GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { db, TABLE, nowSec, queryAll } from "./db";

// Data stream API keys. Only a hash of each key is stored; the raw key is shown
// to the subscriber once. Items (see db.ts for the table layout):
//   apikey / <sha256(key)>          tier, status, subscription, customer
//   apisub / <subscriptionId>       keyHash of the subscription's current key
//   apireveal / <checkoutSessionId> raw key, held until the success page shows it (ttl)
//   userkey#<userId> / <sha256(key)> name, prefix, created, last_used — an account's keys

export type Tier = "free" | "quotes" | "pro";

export interface ApiKeyRecord {
  tier: Tier;
  status: string; // Stripe subscription status, or "active" for free keys
  label: string;  // stable subscriber id the stream service uses for limits
  userId?: string;
  subscription?: string;
  customer?: string;
  livemode: boolean; // test-mode keys only work while the site runs on a test Stripe key
}

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

// ── Account keys ───────────────────────────────────────────────────────────

export const MAX_KEYS_PER_USER = 3;

export interface UserKey {
  id: string;      // sha256 of the key; safe to show, can't be turned back into the key
  name: string;
  prefix: string;  // first characters of the key, to tell keys apart
  tier: Tier;
  created: string;
  last_used: string | null;
}

export const userLabel = (userId: string) => `user:${userId}`;

export async function listUserKeys(userId: string): Promise<UserKey[]> {
  const items = await queryAll(`userkey#${userId}`);
  return items
    .map((i) => ({
      id: i.sk as string,
      name: i.name as string,
      prefix: i.prefix as string,
      tier: (i.tier as Tier) ?? "free",
      created: i.created as string,
      last_used: (i.last_used as string | undefined) ?? null,
    }))
    .sort((a, b) => a.created.localeCompare(b.created));
}

/** Issue a free-tier key on an account. Returns the raw key, which is shown once. */
export async function createUserKey(userId: string, name: string): Promise<{ key: string; item: UserKey } | null> {
  if ((await listUserKeys(userId)).length >= MAX_KEYS_PER_USER) return null;
  const key = newKey();
  const keyHash = hashKey(key);
  const created = new Date().toISOString();
  const prefix = key.slice(0, 10);
  const record: ApiKeyRecord = { tier: "free", status: "active", label: userLabel(userId), userId, livemode: true };
  await db().send(new PutCommand({ TableName: TABLE, Item: { pk: "apikey", sk: keyHash, ...record } }));
  await db().send(
    new PutCommand({
      TableName: TABLE,
      Item: { pk: `userkey#${userId}`, sk: keyHash, name, prefix, tier: record.tier, created },
    })
  );
  return { key, item: { id: keyHash, name, prefix, tier: record.tier, created, last_used: null } };
}

/** Revoke one of an account's keys. Returns false if the key isn't theirs. */
export async function revokeUserKey(userId: string, keyHash: string): Promise<boolean> {
  const res = await db().send(
    new DeleteCommand({ TableName: TABLE, Key: { pk: `userkey#${userId}`, sk: keyHash }, ReturnValues: "ALL_OLD" })
  );
  if (!res.Attributes) return false;
  await db().send(new DeleteCommand({ TableName: TABLE, Key: { pk: "apikey", sk: keyHash } }));
  return true;
}

/** Record when keys were last seen by the stream service. */
export async function touchKeys(userId: string, keyHashes: string[], when: string): Promise<void> {
  for (const keyHash of keyHashes) {
    await db()
      .send(
        new UpdateCommand({
          TableName: TABLE,
          Key: { pk: `userkey#${userId}`, sk: keyHash },
          UpdateExpression: "SET last_used = :t",
          ExpressionAttributeValues: { ":t": when },
          ConditionExpression: "attribute_exists(pk)", // don't resurrect revoked keys
        })
      )
      .catch((e) => {
        if ((e as Error).name !== "ConditionalCheckFailedException") throw e;
      });
  }
}
