import WebSocket from "ws";
import { EventEmitter } from "node:events";

const POLY_WS_URL = "wss://ws-subscriptions-clob.polymarket.com/ws/market";
const ASSETS_PER_SOCKET = 500;
const PING_MS = 10_000;

export interface TokenAsk {
  ask: number | null;
  size: number | null;
  exchange_ts: number | null;
  recv_ts: number;
}

const toKey = (p: string) => Math.round(parseFloat(p) * 10_000);

/**
 * Maintains the ask side of Polymarket CLOB books (one per outcome token) and
 * emits ("ask", tokenId, TokenAsk) whenever a token's best ask changes.
 * Tokens are spread over several sockets to keep each subscription small.
 */
export class PolymarketFeed extends EventEmitter {
  private shards: Shard[] = [];
  private assets: string[] = [];
  private asks = new Map<string, Map<number, number>>();
  private tops = new Map<string, TokenAsk>();

  setAssets(assets: string[]) {
    const changed = assets.length !== this.assets.length || assets.some((a, i) => a !== this.assets[i]);
    if (!changed) return;
    this.assets = assets;
    for (const s of this.shards) s.close();
    this.shards = [];
    for (let i = 0; i < assets.length; i += ASSETS_PER_SOCKET) {
      this.shards.push(new Shard(i / ASSETS_PER_SOCKET, assets.slice(i, i + ASSETS_PER_SOCKET), this));
    }
    console.log(`polymarket: ${assets.length} tokens over ${this.shards.length} sockets`);
  }

  get connectedShards(): number {
    return this.shards.filter((s) => s.connected).length;
  }

  get shardCount(): number {
    return this.shards.length;
  }

  ask(token: string): TokenAsk | undefined {
    return this.tops.get(token);
  }

  /** Called by shards with every event they receive. */
  handle(e: any) {
    if (e.event_type === "book") {
      const levels = new Map<number, number>();
      for (const { price, size } of e.asks ?? []) {
        const s = parseFloat(size);
        if (s > 0) levels.set(toKey(price), s);
      }
      this.asks.set(e.asset_id, levels);
      this.update(e.asset_id, Number(e.timestamp));
    } else if (e.event_type === "price_change") {
      for (const c of e.price_changes ?? []) {
        if (c.side !== "SELL") continue; // only the ask side matters for buying
        let levels = this.asks.get(c.asset_id);
        if (!levels) this.asks.set(c.asset_id, (levels = new Map()));
        const s = parseFloat(c.size);
        if (s > 0) levels.set(toKey(c.price), s);
        else levels.delete(toKey(c.price));
        this.update(c.asset_id, Number(e.timestamp));
      }
    }
  }

  private update(token: string, exchangeTs: number) {
    let top: [number, number] | null = null;
    for (const [p, s] of this.asks.get(token) ?? []) if (!top || p < top[0]) top = [p, s];
    const next: TokenAsk = {
      ask: top ? top[0] / 10_000 : null,
      size: top ? top[1] : null,
      exchange_ts: Number.isFinite(exchangeTs) ? exchangeTs : null,
      recv_ts: Date.now(),
    };
    const cur = this.tops.get(token);
    if (cur && cur.ask === next.ask && cur.size === next.size) return;
    this.tops.set(token, next);
    this.emit("ask", token, next);
  }
}

class Shard {
  private ws: WebSocket | null = null;
  private ping: NodeJS.Timeout | null = null;
  private retryMs = 1_000;
  private closed = false;
  connected = false;

  constructor(private id: number, private assets: string[], private feed: PolymarketFeed) {
    this.connect();
  }

  close() {
    this.closed = true;
    if (this.ping) clearInterval(this.ping);
    this.ws?.removeAllListeners();
    this.ws?.terminate();
  }

  private connect() {
    if (this.closed) return;
    const ws = new WebSocket(POLY_WS_URL);
    this.ws = ws;

    ws.on("open", () => {
      this.connected = true;
      this.retryMs = 1_000;
      ws.send(JSON.stringify({ assets_ids: this.assets, type: "market" }));
      this.ping = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send("PING"), PING_MS);
    });
    ws.on("message", (raw) => {
      const text = raw.toString();
      if (text === "PONG") return;
      try {
        const data = JSON.parse(text);
        for (const e of Array.isArray(data) ? data : [data]) this.feed.handle(e);
      } catch {}
    });
    ws.on("close", (code) => {
      this.connected = false;
      if (this.ping) clearInterval(this.ping);
      if (this.closed) return;
      console.log(`polymarket[${this.id}]: closed (${code}), reconnecting in ${this.retryMs}ms`);
      setTimeout(() => this.connect(), this.retryMs);
      this.retryMs = Math.min(this.retryMs * 2, 30_000);
    });
    ws.on("error", (err) => console.error(`polymarket[${this.id}]:`, err.message));
  }
}
