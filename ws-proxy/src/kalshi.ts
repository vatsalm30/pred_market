import WebSocket from "ws";
import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import type { Quote } from "./types";

const KALSHI_WS_URL = "wss://external-api-ws.kalshi.com/trade-api/ws/v2";
const SUBSCRIBE_BATCH = 200;

// Prices are keyed in 1/10000 dollars so float strings map to stable integer keys.
const toKey = (p: string) => Math.round(parseFloat(p) * 10_000);

interface Book {
  yes: Map<number, number>; // yes bids: price -> size
  no: Map<number, number>;  // no bids
}

function best(levels: Map<number, number>): [number, number] | null {
  let top: [number, number] | null = null;
  for (const [p, s] of levels) if (s > 0 && (!top || p > top[0])) top = [p, s];
  return top;
}

export interface KalshiTrade {
  id: string;
  ticker: string;
  side: "YES" | "NO"; // outcome the taker bought
  price: number;      // dollars per contract on that side
  count: number;      // contracts
  ts: number;         // ms
}

export function loadKalshiKey(pem: string): crypto.KeyObject | null {
  if (!pem) return null;
  pem = pem.replace(/\\n/g, "\n");
  try {
    return crypto.createPrivateKey({ key: pem, format: "pem" });
  } catch {}
  // OpenSSL 3 rejects PKCS#1 PEM directly; loading the DER body as pkcs1 works.
  try {
    const der = Buffer.from(pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, ""), "base64");
    return crypto.createPrivateKey({ key: der, format: "der", type: "pkcs1" });
  } catch (err) {
    console.error("kalshi: failed to load private key:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Maintains Kalshi order books from the orderbook_delta channel and emits
 * ("quote", ticker, Quote) whenever a market's top of book changes.
 * Kalshi books only hold bids: the YES ask is 1 - best NO bid and vice versa.
 * Also emits ("trade", KalshiTrade) for every public trade on the subscribed markets.
 */
export class KalshiFeed extends EventEmitter {
  private ws: WebSocket | null = null;
  private tickers: string[] = [];
  private books = new Map<string, Book>();
  private quotes = new Map<string, Quote>();
  private seqs = new Map<number, number>();
  private retryMs = 1_000;
  private reconnectTimer: NodeJS.Timeout | null = null;
  connected = false;

  constructor(private keyId: string, private key: crypto.KeyObject | null) {
    super();
  }

  setTickers(tickers: string[]) {
    const changed = tickers.length !== this.tickers.length || tickers.some((t, i) => t !== this.tickers[i]);
    this.tickers = tickers;
    if (changed) this.connect();
  }

  quote(ticker: string): Quote | undefined {
    return this.quotes.get(ticker);
  }

  private connect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.terminate();
    }
    this.connected = false;
    if (!this.keyId || !this.key || this.tickers.length === 0) {
      console.warn("kalshi: missing credentials or no tickers — not connecting");
      return;
    }

    const ts = Date.now();
    const signature = crypto
      .sign("sha256", Buffer.from(`${ts}GET/trade-api/ws/v2`), {
        key: this.key,
        padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
        saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
      })
      .toString("base64");
    const ws = new WebSocket(KALSHI_WS_URL, {
      headers: {
        "KALSHI-ACCESS-KEY": this.keyId,
        "KALSHI-ACCESS-SIGNATURE": signature,
        "KALSHI-ACCESS-TIMESTAMP": String(ts),
      },
    });
    this.ws = ws;
    this.books.clear();
    this.seqs.clear();

    ws.on("open", () => {
      this.connected = true;
      this.retryMs = 1_000;
      console.log(`kalshi: connected, subscribing to ${this.tickers.length} markets`);
      for (let i = 0; i < this.tickers.length; i += SUBSCRIBE_BATCH) {
        ws.send(
          JSON.stringify({
            id: i / SUBSCRIBE_BATCH + 1,
            cmd: "subscribe",
            params: { channels: ["orderbook_delta", "trade"], market_tickers: this.tickers.slice(i, i + SUBSCRIBE_BATCH) },
          })
        );
      }
    });
    ws.on("message", (raw) => this.onMessage(raw.toString()));
    ws.on("close", (code) => {
      this.connected = false;
      console.log(`kalshi: closed (${code}), reconnecting in ${this.retryMs}ms`);
      this.reconnectTimer = setTimeout(() => this.connect(), this.retryMs);
      this.retryMs = Math.min(this.retryMs * 2, 30_000);
    });
    ws.on("error", (err) => console.error("kalshi:", err.message));
  }

  private onMessage(raw: string) {
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.type === "error") {
      console.error("kalshi error:", JSON.stringify(msg.msg));
      return;
    }
    if (msg.type === "trade") {
      const t = msg.msg;
      const side = (t.taker_outcome_side ?? t.taker_side) === "no" ? "NO" : "YES";
      const trade: KalshiTrade = {
        id: t.trade_id,
        ticker: t.market_ticker,
        side,
        price: parseFloat(side === "YES" ? t.yes_price_dollars : t.no_price_dollars),
        count: parseFloat(t.count_fp),
        ts: t.ts_ms ?? t.ts * 1000,
      };
      if (Number.isFinite(trade.price) && Number.isFinite(trade.count)) this.emit("trade", trade);
      return;
    }
    if (msg.type !== "orderbook_snapshot" && msg.type !== "orderbook_delta") return;

    // A gap in the per-subscription sequence means a missed delta: rebuild from fresh snapshots.
    const prev = this.seqs.get(msg.sid);
    if (msg.type === "orderbook_delta" && prev !== undefined && msg.seq !== prev + 1) {
      console.warn(`kalshi: sequence gap on sid ${msg.sid} (${prev} -> ${msg.seq}), resyncing`);
      this.connect();
      return;
    }
    this.seqs.set(msg.sid, msg.seq);

    const m = msg.msg;
    const ticker: string = m.market_ticker;
    let book = this.books.get(ticker);
    if (msg.type === "orderbook_snapshot" || !book) {
      book = { yes: new Map(), no: new Map() };
      this.books.set(ticker, book);
    }
    if (msg.type === "orderbook_snapshot") {
      for (const [p, s] of m.yes_dollars_fp ?? []) book.yes.set(toKey(p), parseFloat(s));
      for (const [p, s] of m.no_dollars_fp ?? []) book.no.set(toKey(p), parseFloat(s));
    } else {
      const side = m.side === "yes" ? book.yes : book.no;
      const key = toKey(m.price_dollars);
      const size = (side.get(key) ?? 0) + parseFloat(m.delta_fp);
      if (size > 1e-9) side.set(key, size);
      else side.delete(key);
    }

    const yesBid = best(book.yes);
    const noBid = best(book.no);
    const next: Quote = {
      yes_ask: noBid ? (10_000 - noBid[0]) / 10_000 : null,
      yes_ask_size: noBid ? noBid[1] : null,
      no_ask: yesBid ? (10_000 - yesBid[0]) / 10_000 : null,
      no_ask_size: yesBid ? yesBid[1] : null,
      exchange_ts: m.ts_ms ?? msg.sending_ts_ms ?? null,
      recv_ts: Date.now(),
    };
    const cur = this.quotes.get(ticker);
    if (
      cur &&
      cur.yes_ask === next.yes_ask &&
      cur.no_ask === next.no_ask &&
      cur.yes_ask_size === next.yes_ask_size &&
      cur.no_ask_size === next.no_ask_size
    ) {
      return;
    }
    this.quotes.set(ticker, next);
    this.emit("quote", ticker, next);
  }
}
