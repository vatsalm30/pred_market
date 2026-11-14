import crypto from "node:crypto";
import { DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { db, TABLE, queryAll } from "./db";

// Per-user alert settings and watchlists:
//   alertcfg / <userId>            Discord webhook + min profit, daily digest opt-in
//   watchrule / <userId>#<pairId>  watchlist entry with optional move / gap alert rules
// All rules live in one partition so the stream service can load them in one query.

export interface AlertSettings {
  user_id: string;
  email: string;
  discord_webhook: string | null;
  discord_min_pct: number;
  digest: boolean;
  updated: string;
}

export interface WatchRule {
  user_id: string;
  pair_id: string;
  label: string;
  event: string;
  kalshi_market_id: string;
  move: number | null; // alert when the probability moves this many points
  gap: number | null;  // alert when an arb of at least this profit % opens
  base: number | null; // probability the move is measured from
  last_gap_ts: number | null;
  created: string;
}

const MAX_WATCH = 25;
export const DISCORD_WEBHOOK_RE = /^https:\/\/(?:discord\.com|discordapp\.com|ptb\.discord\.com|canary\.discord\.com)\/api\/webhooks\/\d+\/[\w-]+$/;

// ── Settings ────────────────────────────────────────────────────────────────

export async function getSettings(userId: string): Promise<AlertSettings | null> {
  const res = await db().send(new GetCommand({ TableName: TABLE, Key: { pk: "alertcfg", sk: userId } }));
  return (res.Item as AlertSettings | undefined) ?? null;
}

export async function saveSettings(s: AlertSettings) {
  await db().send(new PutCommand({ TableName: TABLE, Item: { pk: "alertcfg", sk: s.user_id, ...s } }));
}

export async function allSettings(): Promise<AlertSettings[]> {
  return (await queryAll("alertcfg")) as unknown as AlertSettings[];
}

// ── Watchlist ───────────────────────────────────────────────────────────────

export async function listWatch(userId: string): Promise<WatchRule[]> {
  const res = await db().send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :u)",
      ExpressionAttributeValues: { ":pk": "watchrule", ":u": `${userId}#` },
    })
  );
  return (res.Items ?? []) as WatchRule[];
}

export async function allRules(): Promise<WatchRule[]> {
  return (await queryAll("watchrule")) as unknown as WatchRule[];
}

export async function saveWatch(rule: WatchRule): Promise<"ok" | "limit"> {
  const existing = await listWatch(rule.user_id);
  if (existing.length >= MAX_WATCH && !existing.some((r) => r.pair_id === rule.pair_id)) return "limit";
  await db().send(
    new PutCommand({ TableName: TABLE, Item: { pk: "watchrule", sk: `${rule.user_id}#${rule.pair_id}`, ...rule } })
  );
  return "ok";
}

export async function removeWatch(userId: string, pairId: string) {
  await db().send(new DeleteCommand({ TableName: TABLE, Key: { pk: "watchrule", sk: `${userId}#${pairId}` } }));
}

export async function updateRuleState(key: string, fields: { base?: number; last_gap_ts?: number }) {
  const names = Object.keys(fields);
  if (!names.length) return;
  await db().send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { pk: "watchrule", sk: key },
      // "base" is a DynamoDB reserved word, so every field goes through a name placeholder
      UpdateExpression: `SET ${names.map((f) => `#${f} = :${f}`).join(", ")}`,
      ConditionExpression: "attribute_exists(pk)",
      ExpressionAttributeNames: Object.fromEntries(names.map((f) => [`#${f}`, f])),
      ExpressionAttributeValues: Object.fromEntries(Object.entries(fields).map(([k, v]) => [`:${k}`, v])),
    })
  ).catch((e) => {
    if ((e as Error).name !== "ConditionalCheckFailedException") throw e; // rule deleted meanwhile
  });
}

// ── Digest unsubscribe links ────────────────────────────────────────────────

export function unsubscribeToken(userId: string): string {
  return crypto.createHmac("sha256", process.env.AUTH_SECRET ?? "").update(`digest:${userId}`).digest("base64url");
}

export function checkUnsubscribeToken(userId: string, token: string): boolean {
  const want = Buffer.from(unsubscribeToken(userId));
  const got = Buffer.from(token);
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}
