import { Engine } from "./engine";
import { KalshiFeed, loadKalshiKey } from "./kalshi";
import { PolymarketFeed } from "./polymarket";
import { loadPairs } from "./pairs";
import { parseApiKeys, startServer } from "./server";
import { Auth } from "./auth";

// ── Config ────────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT ?? "8080");
// API key ID shown in Kalshi dashboard after uploading your public RSA key
const KALSHI_API_KEY_ID = process.env.KALSHI_API_KEY_ID ?? "";
// RSA private key PEM content (real or \n-escaped newlines)
const KALSHI_PRIVATE_KEY = process.env.KALSHI_PRIVATE_KEY ?? "";
// The pipeline's matched markets, e.g. https://www.omnipred.com/data/matched_markets.json
const MARKET_DATA_URL = process.env.MARKET_DATA_URL ?? "";
// Reload matched markets every N ms (default 35 min, slightly after the hourly pipeline)
const REFRESH_MS = parseInt(process.env.REFRESH_MS ?? "2100000");
// Internal keys for /v1 (always Pro, no limits): "label:key,label2:key2"
const API_KEYS = parseApiKeys(process.env.API_KEYS ?? "");
// Subscriber keys (free tier for now) are checked against the website
const STREAM_VERIFY_URL = process.env.STREAM_VERIFY_URL ?? "";
const STREAM_VERIFY_SECRET = process.env.STREAM_VERIFY_SECRET ?? "";
const MIN_PROFIT_PCT = parseFloat(process.env.MIN_PROFIT_PCT ?? "0.5");
const MIN_OUTCOME_SCORE = parseFloat(process.env.MIN_OUTCOME_SCORE ?? "0.8");

async function init() {
  const engine = new Engine({ minProfitPct: MIN_PROFIT_PCT, minOutcomeScore: MIN_OUTCOME_SCORE });
  const kalshi = new KalshiFeed(KALSHI_API_KEY_ID, loadKalshiKey(KALSHI_PRIVATE_KEY));
  const poly = new PolymarketFeed();
  kalshi.on("quote", (ticker, q) => engine.onKalshiQuote(ticker, q));
  poly.on("ask", (token, a) => engine.onPolyAsk(token, a));

  const refresh = async () => {
    if (!MARKET_DATA_URL) return console.warn("MARKET_DATA_URL not set — no markets to stream");
    try {
      const pairs = await loadPairs(MARKET_DATA_URL);
      engine.setPairs(pairs);
      kalshi.setTickers(engine.kalshiTickers().sort());
      poly.setAssets(engine.polyTokens().sort());
      console.log(`loaded ${pairs.length} open pairs`);
    } catch (err) {
      console.error("refresh failed:", err instanceof Error ? err.message : err);
    }
  };

  const auth = new Auth({ staticKeys: API_KEYS, verifyUrl: STREAM_VERIFY_URL, verifySecret: STREAM_VERIFY_SECRET });
  startServer(
    { port: PORT, auth, usageUrl: STREAM_VERIFY_URL.replace(/\/verify$/, "/usage"), usageSecret: STREAM_VERIFY_SECRET }, engine, kalshi, poly);
  console.log(`${API_KEYS.size} static API keys; subscriber keys ${STREAM_VERIFY_URL ? `via ${STREAM_VERIFY_URL}` : "disabled"}`);
  await refresh();
  setInterval(refresh, REFRESH_MS);
}

// Last line of defence: log and keep serving rather than dropping every client.
// Errors should still be handled where they happen; this only catches what slips through.
process.on("uncaughtException", (err) => console.error("uncaught exception:", err));
process.on("unhandledRejection", (err) => console.error("unhandled rejection:", err));

init().catch(console.error);
