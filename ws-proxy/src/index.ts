import WebSocket, { WebSocketServer } from "ws";
import http from "node:http";
import crypto from "node:crypto";

// ── Config ────────────────────────────────────────────────────────────────────
const KALSHI_WS_URL = "wss://external-api-ws.kalshi.com/trade-api/ws/v2";
const PORT = parseInt(process.env.PORT ?? "8080");

// API key ID shown in Kalshi dashboard after uploading your public RSA key
const API_KEY_ID = process.env.KALSHI_API_KEY_ID ?? "";
// RSA private key PEM content (export from file or paste as \n-separated string)
const PRIVATE_KEY_PEM = (process.env.KALSHI_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
// URL of your hosted matched_markets.json (Vercel URL, e.g. https://omnipred.vercel.app/data/matched_markets.json)
const MARKET_DATA_URL = process.env.MARKET_DATA_URL ?? "";
// Refresh market subscriptions every N ms (default 35 min, slightly after pipeline cron)
const REFRESH_MS = parseInt(process.env.REFRESH_MS ?? "2100000");

// ── RSA-PSS signing for Kalshi WS auth ───────────────────────────────────────
function loadPrivateKey(): crypto.KeyObject | null {
  if (!PRIVATE_KEY_PEM) return null;

  // Try PKCS#8 PEM first (BEGIN PRIVATE KEY)
  try {
    const key = crypto.createPrivateKey({ key: PRIVATE_KEY_PEM, format: "pem" });
    console.log(`Private key loaded: ${key.asymmetricKeyType}`);
    return key;
  } catch {}

  // Fallback: PKCS#1 RSA key (BEGIN RSA PRIVATE KEY) via explicit DER decode
  // Node 18+ with OpenSSL 3 rejects PKCS#1 PEM directly; loading as DER with type:'pkcs1' works.
  try {
    const b64 = PRIVATE_KEY_PEM
      .replace(/-----BEGIN [^-]+-----/, "")
      .replace(/-----END [^-]+-----/, "")
      .replace(/\s+/g, "");
    const der = Buffer.from(b64, "base64");
    const key = crypto.createPrivateKey({ key: der, format: "der", type: "pkcs1" });
    console.log(`Private key loaded: ${key.asymmetricKeyType} (PKCS#1 via DER fallback)`);
    return key;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const preview = PRIVATE_KEY_PEM.slice(0, 50).replace(/\n/g, "\\n");
    console.error(`Failed to load private key (${PRIVATE_KEY_PEM.length} chars, starts: ${preview}): ${msg}`);
    return null;
  }
}

let privateKey: crypto.KeyObject | null = null;

function kalshiSignature(timestampMs: number): string {
  if (!privateKey) throw new Error("RSA private key not loaded");
  const message = `${timestampMs}GET/trade-api/ws/v2`;
  return crypto
    .sign("sha256", Buffer.from(message), {
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
    })
    .toString("base64");
}

// ── State ─────────────────────────────────────────────────────────────────────
interface PriceUpdate {
  market_ticker: string;
  yes_ask: number;
  no_ask: number;
  ts: number;
}

const priceCache = new Map<string, PriceUpdate>();
const clients = new Set<WebSocket>();
let kalshiTickers: string[] = [];
let kalshiWs: WebSocket | null = null;

// ── Market list ───────────────────────────────────────────────────────────────
async function fetchMarketTickers(): Promise<string[]> {
  if (!MARKET_DATA_URL) return [];
  try {
    const res = await fetch(MARKET_DATA_URL);
    const rows = (await res.json()) as Array<{ kalshi_market_id: string }>;
    const tickers = [...new Set(rows.map((r) => r.kalshi_market_id))].filter(Boolean);
    console.log(`Loaded ${tickers.length} Kalshi tickers from ${MARKET_DATA_URL}`);
    return tickers;
  } catch (err) {
    console.error("Failed to fetch market list:", err);
    return [];
  }
}

// ── Kalshi WS connection ──────────────────────────────────────────────────────
function connectKalshi(tickers: string[]) {
  if (kalshiWs) {
    kalshiWs.removeAllListeners();
    kalshiWs.close();
  }

  if (!API_KEY_ID || !privateKey || tickers.length === 0) {
    console.warn("Kalshi WS: missing credentials or empty ticker list — skipping");
    return;
  }

  let sig: string;
  try {
    const ts = Date.now();
    sig = kalshiSignature(ts);
    kalshiWs = new WebSocket(KALSHI_WS_URL, {
      headers: {
        "KALSHI-ACCESS-KEY": API_KEY_ID,
        "KALSHI-ACCESS-SIGNATURE": sig,
        "KALSHI-ACCESS-TIMESTAMP": ts.toString(),
      },
    });
  } catch (err) {
    console.error("Kalshi WS: failed to sign request —", err instanceof Error ? err.message : err);
    return;
  }

  kalshiWs.on("open", () => {
    console.log(`Kalshi WS connected. Subscribing to ${tickers.length} markets...`);
    const batchSize = 200;
    for (let i = 0; i < tickers.length; i += batchSize) {
      const batch = tickers.slice(i, i + batchSize);
      kalshiWs!.send(
        JSON.stringify({
          id: Math.floor(i / batchSize) + 1,
          cmd: "subscribe",
          params: { channels: ["ticker"], market_tickers: batch },
        })
      );
    }
  });

  kalshiWs.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      // Kalshi sends: { type: "ticker", msg: { market_ticker, yes_ask, no_ask, ... } }
      const payload = msg.msg ?? msg;
      if ((msg.type === "ticker" || payload.yes_ask !== undefined) && payload.market_ticker) {
        const update: PriceUpdate = {
          market_ticker: payload.market_ticker,
          yes_ask: Number(payload.yes_ask),
          no_ask: Number(payload.no_ask),
          ts: Date.now(),
        };
        priceCache.set(update.market_ticker, update);
        broadcast({ type: "kalshi_price", ...update });
      }
    } catch {}
  });

  kalshiWs.on("close", (code) => {
    console.log(`Kalshi WS closed (${code}), reconnecting in 10s...`);
    setTimeout(() => connectKalshi(kalshiTickers), 10_000);
  });

  kalshiWs.on("error", (err) => {
    console.error("Kalshi WS error:", err.message);
  });
}

// ── Browser WS server ─────────────────────────────────────────────────────────
function broadcast(data: object) {
  const msg = JSON.stringify(data);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  }
}

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200).end(JSON.stringify({ ok: true, clients: clients.size, tickers: kalshiTickers.length }));
  } else {
    res.writeHead(404).end();
  }
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws, req) => {
  const origin = req.headers.origin ?? "unknown";
  console.log(`Client connected from ${origin}. Total: ${clients.size + 1}`);
  clients.add(ws);

  // Flush current cache to new client
  for (const update of priceCache.values()) {
    ws.send(JSON.stringify({ type: "kalshi_price", ...update }));
  }
  ws.send(JSON.stringify({ type: "ready", tickers: kalshiTickers.length }));

  ws.on("close", () => {
    clients.delete(ws);
    console.log(`Client disconnected. Total: ${clients.size}`);
  });
});

// ── Startup ───────────────────────────────────────────────────────────────────
async function init() {
  privateKey = loadPrivateKey();
  kalshiTickers = await fetchMarketTickers();
  connectKalshi(kalshiTickers);

  // Periodically refresh market list and reconnect
  setInterval(async () => {
    console.log("Refreshing market list...");
    const fresh = await fetchMarketTickers();
    const added = fresh.filter((t) => !kalshiTickers.includes(t));
    if (added.length > 0) {
      console.log(`${added.length} new tickers found, reconnecting...`);
      kalshiTickers = fresh;
      connectKalshi(kalshiTickers);
    }
  }, REFRESH_MS);

  server.listen(PORT, () => {
    console.log(`OmniPred WS proxy running on :${PORT}`);
    console.log(`  Kalshi tickers: ${kalshiTickers.length}`);
    console.log(`  Market refresh: every ${REFRESH_MS / 60000} min`);
  });
}

init().catch(console.error);
