import { GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { db, TABLE, isLive, nowSec } from "./db";

export interface WhaleTrade {
  id: string;
  venue?: "polymarket" | "kalshi"; // missing on older items, which are all Polymarket
  marketUrl?: string;
  marketTitle: string;
  marketSlug?: string;
  conditionId: string;
  assetId: string;
  outcome: string;
  side: "BUY" | "SELL";
  size: number;
  price: number;
  usdValue: number;
  traderAddress: string;
  txHash?: string;
  timestamp: number; // unix seconds
}

// Trades expire via ttl rather than a fixed 500-entry cap
const TRADE_TTL = 14 * 86400;

export async function saveWhaleTrade(trade: WhaleTrade): Promise<void> {
  // Zero-padded timestamp prefix keeps the partition sorted newest-last
  const sk = `${String(trade.timestamp).padStart(12, "0")}#${trade.id}`;
  await db().send(
    new PutCommand({ TableName: TABLE, Item: { pk: "whale", sk, ttl: nowSec() + TRADE_TTL, data: trade } })
  );
}

export async function isWhaleSeen(id: string): Promise<boolean> {
  const res = await db().send(new GetCommand({ TableName: TABLE, Key: { pk: `whaleseen#${id}`, sk: "_" } }));
  return isLive(res.Item);
}

export async function markWhaleSeen(id: string): Promise<void> {
  await db().send(
    new PutCommand({ TableName: TABLE, Item: { pk: `whaleseen#${id}`, sk: "_", ttl: nowSec() + 7 * 86400 } })
  );
}

export async function getRecentWhales(limit = 50): Promise<WhaleTrade[]> {
  try {
    const res = await db().send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "pk = :pk",
        ExpressionAttributeValues: { ":pk": "whale" },
        ScanIndexForward: false,
        Limit: limit,
      })
    );
    return (res.Items ?? []).filter(isLive).map((i) => i.data as WhaleTrade);
  } catch {
    return [];
  }
}

export async function cacheMarket(conditionId: string, info: { title: string; slug?: string }): Promise<void> {
  await db().send(
    new PutCommand({
      TableName: TABLE,
      Item: { pk: `whalemkt#${conditionId}`, sk: "_", ttl: nowSec() + 24 * 3600, data: info },
    })
  );
}

export async function getCachedMarket(conditionId: string): Promise<{ title: string; slug?: string } | null> {
  const res = await db().send(new GetCommand({ TableName: TABLE, Key: { pk: `whalemkt#${conditionId}`, sk: "_" } }));
  return isLive(res.Item) ? (res.Item!.data as { title: string; slug?: string }) : null;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function formatWhaleAlert(trade: WhaleTrade): string {
  const usd = trade.usdValue >= 1000
    ? `$${(trade.usdValue / 1000).toFixed(1)}K`
    : `$${Math.round(trade.usdValue)}`;
  const sideEmoji = trade.side === "BUY" ? "🟢" : "🔴";
  const price = `${(trade.price * 100).toFixed(1)}¢`;
  const trader = `${trade.traderAddress.slice(0, 6)}…${trade.traderAddress.slice(-4)}`;
  const url = trade.marketSlug
    ? `https://polymarket.com/event/${trade.marketSlug}`
    : "https://polymarket.com";

  return (
    `🐋 <b>Whale Move — ${usd}</b>\n\n` +
    `${sideEmoji} <b>${trade.side}</b> ${trade.outcome} on <b>${escapeHtml(trade.marketTitle)}</b>\n` +
    `Price: ${price} · ${trade.size.toFixed(0)} shares\n` +
    `Trader: <code>${trader}</code>\n\n` +
    `<a href="${url}">View on Polymarket →</a>`
  );
}
