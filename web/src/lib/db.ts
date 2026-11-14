import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";

// Single DynamoDB table (pk + sk, with a `ttl` attribute for expiry). Item layout:
//   sub / <chatId>                Telegram subscriber
//   seen#<oppKey> / _             alert dedupe marker (ttl)
//   alert / <iso ts>#<n>          recent alert feed (ttl)
//   meta / last_scan              last scan timestamp
//   blog / <slug>, news / <slug>  posts, `score` = publish time in ms
//   whale / <ts>#<id>             whale trades (ttl)
//   whaleseen#<id> / _            whale dedupe marker (ttl)
//   meta / whale_watermark        newest whale trade already saved
//   apikey, apisub, apireveal, userkey#<userId>   data stream API keys (apikeys.ts)
//   user, userlogin#<provider>, useremail       accounts (users.ts)
//   usage#<label> / <date>, live / <label>      stream usage reported by ws-proxy (usage.ts)
//   hist#<pairId>, snap, arbstats               price history, movers and gap stats (insights.ts)
//   alertcfg, watchrule                         Discord / digest settings and watchlists (alerts.ts)
//   daily / <date>                              marks the daily digest as sent
//
// Credentials use OMNIPRED_-prefixed names because some hosts reserve AWS_*.

let _db: DynamoDBDocumentClient | null = null;

export function db(): DynamoDBDocumentClient {
  if (!_db) {
    const accessKeyId = process.env.OMNIPRED_AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.OMNIPRED_AWS_SECRET_ACCESS_KEY;
    _db = DynamoDBDocumentClient.from(
      new DynamoDBClient({
        region: process.env.OMNIPRED_AWS_REGION ?? "us-east-1",
        // Fall back to the default provider chain (e.g. Lambda role) when unset
        credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined,
      }),
      { marshallOptions: { removeUndefinedValues: true } }
    );
  }
  return _db;
}

export const TABLE = process.env.DYNAMODB_TABLE ?? "omnipred";

export function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

/** DynamoDB deletes expired items lazily, so reads must filter them out too. */
export function isLive(item: Record<string, unknown> | undefined): boolean {
  if (!item) return false;
  return typeof item.ttl !== "number" || item.ttl > nowSec();
}

/** Query every item in a partition, following pagination. */
export async function queryAll(pk: string): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const res = await db().send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "pk = :pk",
        ExpressionAttributeValues: { ":pk": pk },
        ExclusiveStartKey,
      })
    );
    items.push(...(res.Items ?? []));
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

/** Put an item only if no live item exists at that key. Returns false if one does. */
export async function putIfAbsent(item: Record<string, unknown>): Promise<boolean> {
  try {
    await db().send(
      new PutCommand({
        TableName: TABLE,
        Item: item,
        ConditionExpression: "attribute_not_exists(pk) OR #ttl < :now",
        ExpressionAttributeNames: { "#ttl": "ttl" },
        ExpressionAttributeValues: { ":now": nowSec() },
      })
    );
    return true;
  } catch (e) {
    if ((e as Error).name === "ConditionalCheckFailedException") return false;
    throw e;
  }
}
