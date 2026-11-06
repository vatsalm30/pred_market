import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { db, TABLE, nowSec, isLive } from "./db";

// Stream usage, reported by ws-proxy every minute. Items:
//   usage#<label> / <yyyy-mm-dd>   counters for that UTC day (ttl 90 days)
//   live / <label>                 connections right now (ttl: goes stale if reports stop)

export interface DayUsage {
  date: string;
  realtime_s: number;  // seconds of realtime streaming
  rest: number;        // REST requests
  messages: number;    // messages the client sent (subscribe, ping, …)
  updates: number;     // quote/arb messages we pushed
  connects: number;    // WebSocket connections opened
}

export interface UsageReport extends Omit<DayUsage, "date"> {
  label: string;
  key_hashes: string[];  // keys seen in this period
  connections: number;   // open right now
  mode: "realtime" | "digest" | null;
}

const COUNTERS = ["realtime_s", "rest", "messages", "updates", "connects"] as const;
const today = () => new Date().toISOString().slice(0, 10);

export async function recordUsage(r: UsageReport, date = today()): Promise<void> {
  const deltas = COUNTERS.filter((c) => r[c] > 0);
  if (deltas.length) {
    await db().send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { pk: `usage#${r.label}`, sk: date },
        UpdateExpression: `ADD ${deltas.map((c) => `${c} :${c}`).join(", ")} SET #ttl = :ttl`,
        ExpressionAttributeNames: { "#ttl": "ttl" },
        ExpressionAttributeValues: {
          ...Object.fromEntries(deltas.map((c) => [`:${c}`, r[c]])),
          ":ttl": nowSec() + 90 * 86400,
        },
      })
    );
  }
  await db().send(
    new PutCommand({
      TableName: TABLE,
      Item: { pk: "live", sk: r.label, connections: r.connections, mode: r.mode, updated: new Date().toISOString(), ttl: nowSec() + 180 },
    })
  );
}

/** The last `days` UTC days, oldest first, with zeros for days without traffic. */
export async function getUsage(label: string, days = 14): Promise<DayUsage[]> {
  const dates = Array.from({ length: days }, (_, i) =>
    new Date(Date.now() - (days - 1 - i) * 86400_000).toISOString().slice(0, 10)
  );
  const res = await db().send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "pk = :pk AND sk >= :from",
      ExpressionAttributeValues: { ":pk": `usage#${label}`, ":from": dates[0] },
    })
  );
  const byDate = new Map((res.Items ?? []).map((i) => [i.sk as string, i]));
  return dates.map((date) => {
    const i = byDate.get(date);
    return Object.fromEntries([["date", date], ...COUNTERS.map((c) => [c, Number(i?.[c] ?? 0)])]) as unknown as DayUsage;
  });
}

export async function realtimeUsedToday(label: string): Promise<number> {
  const res = await db().send(new GetCommand({ TableName: TABLE, Key: { pk: `usage#${label}`, sk: today() } }));
  return Number(res.Item?.realtime_s ?? 0);
}

export async function getLive(label: string): Promise<{ connections: number; mode: string | null; updated: string } | null> {
  const res = await db().send(new GetCommand({ TableName: TABLE, Key: { pk: "live", sk: label } }));
  if (!isLive(res.Item)) return null;
  return { connections: Number(res.Item!.connections), mode: (res.Item!.mode as string) ?? null, updated: res.Item!.updated as string };
}
