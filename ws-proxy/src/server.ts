import http from "node:http";
import WebSocket, { WebSocketServer } from "ws";
import type { Engine } from "./engine";
import type { KalshiFeed } from "./kalshi";
import type { PolymarketFeed } from "./polymarket";
import type { Arb, Pair } from "./types";
import type { Auth, Tier } from "./auth";
import { LIMITS, MAX_FREE_CONNECTIONS_PER_IP, RealtimeBudget, WindowLimiter, type TierLimits } from "./limits";

export interface ServerOptions {
  port: number;
  auth: Auth;
}

interface ArbFilter {
  minProfitPct: number;
  minOutcomeScore: number;
  minEventScore: number;
}

interface Client {
  id: number;
  ws: WebSocket;
  key: string;
  label: string;
  tier: Tier;
  ip: string;
  quotes: Set<string> | "all" | null;
  arbs: ArbFilter | null;
  alive: boolean;
  // Once the daily realtime budget is spent, updates are held here and flushed as digests.
  realtime: boolean;
  pendingPairs: Set<string>;
  pendingArbs: Map<string, { event: string; arb: Arb }>;
  nextDigest: number;
}

const MAX_BUFFERED = 8 * 1024 * 1024; // drop clients that can't keep up instead of buffering forever
const UPGRADES_PER_IP_PER_MIN = 20;

/** Static keys from env, "label:key,label2:key2". */
export function parseApiKeys(raw: string): Map<string, string> {
  const keys = new Map<string, string>();
  for (const entry of raw.split(",").map((s) => s.trim()).filter(Boolean)) {
    const i = entry.indexOf(":");
    if (i > 0) keys.set(entry.slice(i + 1), entry.slice(0, i));
  }
  return keys;
}

function requestKey(req: http.IncomingMessage, url: URL): string | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  const header = req.headers["x-api-key"];
  if (typeof header === "string") return header;
  return url.searchParams.get("api_key");
}

function clientIp(req: http.IncomingMessage): string {
  const fly = req.headers["fly-client-ip"];
  if (typeof fly === "string") return fly;
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string") return fwd.split(",")[0].trim();
  return req.socket.remoteAddress ?? "unknown";
}

const pairMeta = (p: Pair) => ({
  poly_event: p.poly_event,
  kalshi_event: p.kalshi_event,
  poly_label: p.poly_label,
  kalshi_label: p.kalshi_label,
  event_score: p.event_score,
  outcome_score: p.outcome_score,
  poly_end_date: p.poly_end_date,
  kalshi_end_date: p.kalshi_end_date,
  poly_url: p.poly_url,
  kalshi_url: p.kalshi_url,
});

const finite = (n: number) => (Number.isFinite(n) ? n : null);

const limitsMsg = (l: TierLimits) => ({
  max_connections: l.maxConnections,
  max_quote_pairs: finite(l.maxQuotePairs),
  max_arb_snapshot: finite(l.maxArbSnapshot),
  realtime_seconds_per_day: finite(l.realtimeSecondsPerDay),
  digest_interval_ms: l.digestIntervalMs || null,
  ops_per_10s: l.opsPer10s,
  rest_per_hour: l.restPerHour,
});

export function startServer(opts: ServerOptions, engine: Engine, kalshi: KalshiFeed, poly: PolymarketFeed) {
  const clients = new Set<Client>();
  const legacy = new Set<WebSocket>();
  const startedAt = Date.now();
  const budget = new RealtimeBudget();
  const opsLimiter = new WindowLimiter(10_000);
  const restLimiter = new WindowLimiter(3_600_000);
  const upgradeLimiter = new WindowLimiter(60_000);
  let nextId = 1;

  const send = (c: Client, data: object) => {
    if (c.ws.readyState !== WebSocket.OPEN) return;
    if (c.ws.bufferedAmount > MAX_BUFFERED) {
      c.ws.close(1013, "slow consumer");
      return;
    }
    c.ws.send(JSON.stringify(data));
  };

  const quoteMsg = (pairId: string) => ({ type: "quote", pair_id: pairId, ...engine.quotes(pairId), ts: Date.now() });
  const arbMsg = (event: string, arb: Arb) => {
    const pair = engine.pairs.get(arb.pair_id);
    return { type: "arb", event, ...arb, ...(pair ? pairMeta(pair) : {}), ts: Date.now() };
  };
  const arbPasses = (f: ArbFilter, arb: Arb) => {
    const pair = engine.pairs.get(arb.pair_id);
    return (
      arb.net_profit_pct >= f.minProfitPct &&
      (pair?.outcome_score ?? 0) >= f.minOutcomeScore &&
      (pair?.event_score ?? 0) >= f.minEventScore
    );
  };
  const topArbs = (f: ArbFilter, limit: number) =>
    [...engine.arbs.values()]
      .filter((a) => arbPasses(f, a))
      .sort((a, b) => b.net_profit_pct - a.net_profit_pct)
      .slice(0, limit)
      .map((a) => arbMsg("open", a));

  const realtimeRemaining = (c: Client) =>
    Math.max(0, LIMITS[c.tier].realtimeSecondsPerDay - budget.usedSeconds(c.label));

  // ── Fan-out ────────────────────────────────────────────────────────────────
  engine.on("pair", (pairId: string) => {
    let msg: object | null = null;
    for (const c of clients) {
      if (!(c.quotes === "all" || c.quotes?.has(pairId))) continue;
      if (c.realtime) send(c, (msg ??= quoteMsg(pairId)));
      else c.pendingPairs.add(pairId);
    }
  });

  engine.on("arb", (event: string, arb: Arb) => {
    for (const c of clients) {
      // Close events go to everyone subscribed so clients never hold stale arbs.
      if (!c.arbs || (event !== "close" && !arbPasses(c.arbs, arb))) continue;
      if (c.realtime) {
        send(c, arbMsg(event, arb));
        continue;
      }
      // Collapse held events: an arb opened and closed between digests is never sent.
      const prev = c.pendingArbs.get(arb.arb_id);
      if (prev?.event === "open" && event === "close") c.pendingArbs.delete(arb.arb_id);
      else c.pendingArbs.set(arb.arb_id, { event: prev?.event === "open" ? "open" : event, arb });
    }
  });

  // Website feed (unauthenticated, Kalshi only, original message format).
  kalshi.on("quote", (ticker: string, q) => {
    if (legacy.size === 0) return;
    const msg = JSON.stringify({ type: "kalshi_price", market_ticker: ticker, yes_ask: q.yes_ask, no_ask: q.no_ask, ts: q.recv_ts });
    for (const ws of legacy) if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  });

  // Charge realtime seconds to subscribed free clients, switch them to digests when spent,
  // and flush digests that are due.
  setInterval(() => {
    const now = Date.now();
    const charged = new Set<string>();
    for (const c of clients) {
      const limits = LIMITS[c.tier];
      if (c.realtime && Number.isFinite(limits.realtimeSecondsPerDay) && (c.quotes || c.arbs)) {
        if (!charged.has(c.label)) {
          budget.add(c.label, 1);
          charged.add(c.label);
        }
        if (realtimeRemaining(c) <= 0) {
          c.realtime = false;
          c.nextDigest = now + limits.digestIntervalMs;
          send(c, {
            type: "notice",
            mode: "digest",
            message: `Daily realtime budget used. Updates now arrive every ${limits.digestIntervalMs / 1000}s until 00:00 UTC.`,
            realtime_resets_in_s: Math.round(RealtimeBudget.msUntilReset() / 1000),
          });
        }
      } else if (!c.realtime && realtimeRemaining(c) > 0) {
        c.realtime = true; // a new UTC day started
        send(c, { type: "notice", mode: "realtime", message: "Realtime budget reset.", realtime_seconds_remaining: realtimeRemaining(c) });
      }

      if (!c.realtime && now >= c.nextDigest) {
        c.nextDigest = now + limits.digestIntervalMs;
        for (const id of c.pendingPairs) send(c, quoteMsg(id));
        for (const { event, arb } of c.pendingArbs.values()) send(c, arbMsg(event, arb));
        c.pendingPairs.clear();
        c.pendingArbs.clear();
      }
    }
  }, 1_000);

  // ── Client protocol ──────────────────────────────────────────────────────
  function onClientMessage(c: Client, raw: string) {
    const limits = LIMITS[c.tier];
    if (!opsLimiter.allow(String(c.id), limits.opsPer10s).ok) {
      send(c, { type: "error", error: `rate limited: max ${limits.opsPer10s} messages per 10s` });
      return c.ws.close(1008, "rate limited");
    }
    let m: any;
    try {
      m = JSON.parse(raw);
    } catch {
      return send(c, { type: "error", error: "invalid JSON" });
    }
    if (m.op === "ping") return send(c, { type: "pong", id: m.id, ts: Date.now() });
    if (m.op === "usage") {
      return send(c, {
        type: "usage",
        tier: c.tier,
        mode: c.realtime ? "realtime" : "digest",
        realtime_seconds_remaining: finite(realtimeRemaining(c)),
        realtime_resets_in_s: Math.round(RealtimeBudget.msUntilReset() / 1000),
        limits: limitsMsg(limits),
      });
    }

    if (m.op === "subscribe" && m.channel === "quotes") {
      if (!Array.isArray(m.pairs)) {
        if (Number.isFinite(limits.maxQuotePairs)) {
          return send(c, { type: "error", error: `pass pairs: [...] (up to ${limits.maxQuotePairs}); list them with GET /v1/pairs` });
        }
        c.quotes = "all";
      } else {
        const unknown = m.pairs.filter((id: string) => !engine.pairs.has(id));
        if (unknown.length) send(c, { type: "error", error: "unknown pair_id", pairs: unknown.slice(0, 20) });
        const set = c.quotes instanceof Set ? c.quotes : new Set<string>();
        for (const id of m.pairs) if (engine.pairs.has(id)) set.add(id);
        if (set.size > limits.maxQuotePairs) {
          return send(c, { type: "error", error: `your plan allows ${limits.maxQuotePairs} pairs; unsubscribe some first` });
        }
        c.quotes = set;
      }
      const ids = c.quotes === "all" ? [...engine.pairs.keys()] : [...c.quotes];
      return send(c, { type: "snapshot", channel: "quotes", data: ids.map((id) => quoteMsg(id)) });
    }
    if (m.op === "subscribe" && m.channel === "arbs") {
      if (limits.maxArbSnapshot === 0) return send(c, { type: "error", error: "your plan does not include arbs" });
      c.arbs = {
        minProfitPct: Number(m.min_profit_pct ?? 0),
        minOutcomeScore: Number(m.min_outcome_score ?? 0),
        minEventScore: Number(m.min_event_score ?? 0),
      };
      return send(c, { type: "snapshot", channel: "arbs", data: topArbs(c.arbs, limits.maxArbSnapshot) });
    }
    if (m.op === "unsubscribe" && m.channel === "quotes") {
      if (Array.isArray(m.pairs) && c.quotes instanceof Set) for (const id of m.pairs) c.quotes.delete(id);
      else c.quotes = null;
      return send(c, { type: "unsubscribed", channel: "quotes" });
    }
    if (m.op === "unsubscribe" && m.channel === "arbs") {
      c.arbs = null;
      return send(c, { type: "unsubscribed", channel: "arbs" });
    }
    send(c, { type: "error", error: "unknown op or channel" });
  }

  // ── REST ─────────────────────────────────────────────────────────────────
  const json = (res: http.ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
    res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", ...headers });
    res.end(JSON.stringify(body));
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname === "/health") {
      return json(res, 200, {
        ok: kalshi.connected && poly.connectedShards === poly.shardCount,
        uptime_s: Math.round((Date.now() - startedAt) / 1000),
        pairs: engine.pairs.size,
        open_arbs: engine.arbs.size,
        clients: clients.size,
        website_clients: legacy.size,
        kalshi_connected: kalshi.connected,
        polymarket_sockets: `${poly.connectedShards}/${poly.shardCount}`,
      });
    }
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Authorization, X-API-Key",
      });
      return res.end();
    }
    if (!url.pathname.startsWith("/v1/")) return json(res, 404, { error: "not found" });

    if (!upgradeLimiter.allow(`rest:${clientIp(req)}`, UPGRADES_PER_IP_PER_MIN * 3).ok) {
      return json(res, 429, { error: "too many requests from this IP" });
    }
    const principal = await opts.auth.check(requestKey(req, url));
    if (!principal) return json(res, 401, { error: "missing, invalid or inactive API key" });
    const limits = LIMITS[principal.tier];
    const rate = restLimiter.allow(principal.label, limits.restPerHour);
    const rateHeaders = {
      "X-RateLimit-Limit": String(limits.restPerHour),
      "X-RateLimit-Remaining": String(rate.remaining),
      "X-RateLimit-Reset": String(Math.ceil(rate.resetMs / 1000)),
    };
    if (!rate.ok) return json(res, 429, { error: `rate limited: ${limits.restPerHour} requests per hour` }, rateHeaders);

    if (url.pathname === "/v1/pairs") {
      return json(res, 200, [...engine.pairs.values()].map((p) => ({
        pair_id: p.pair_id,
        kalshi_ticker: p.kalshi_ticker,
        poly_market_id: p.poly_market_id,
        ...pairMeta(p),
      })), rateHeaders);
    }
    if (url.pathname === "/v1/arbs") {
      if (limits.maxArbSnapshot === 0) return json(res, 403, { error: "your plan does not include arbs" }, rateHeaders);
      const f: ArbFilter = {
        minProfitPct: Number(url.searchParams.get("min_profit_pct") ?? 0),
        minOutcomeScore: Number(url.searchParams.get("min_outcome_score") ?? 0),
        minEventScore: Number(url.searchParams.get("min_event_score") ?? 0),
      };
      return json(res, 200, topArbs(f, limits.maxArbSnapshot), rateHeaders);
    }
    if (url.pathname === "/v1/quotes") {
      const ids = url.searchParams.getAll("pair_id");
      const unknown = ids.filter((id) => !engine.pairs.has(id));
      if (ids.length === 0 || unknown.length) {
        return json(res, 400, { error: "pass one or more known pair_id params", unknown }, rateHeaders);
      }
      if (ids.length > limits.maxQuotePairs) {
        return json(res, 400, { error: `your plan allows ${limits.maxQuotePairs} pairs per request` }, rateHeaders);
      }
      return json(res, 200, ids.map((id) => quoteMsg(id)), rateHeaders);
    }
    json(res, 404, { error: "not found" }, rateHeaders);
  });

  // ── WebSocket upgrades ───────────────────────────────────────────────────
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const reject = (status: number, message: string) => {
      socket.end(`HTTP/1.1 ${status} ${message}\r\nContent-Type: text/plain\r\n\r\n${message}\n`);
    };

    if (url.pathname === "/") {
      return wss.handleUpgrade(req, socket, head, (ws) => {
        legacy.add(ws);
        for (const ticker of engine.kalshiTickers()) {
          const q = kalshi.quote(ticker);
          if (q) ws.send(JSON.stringify({ type: "kalshi_price", market_ticker: ticker, yes_ask: q.yes_ask, no_ask: q.no_ask, ts: q.recv_ts }));
        }
        ws.send(JSON.stringify({ type: "ready", tickers: engine.kalshiTickers().length }));
        ws.on("close", () => legacy.delete(ws));
      });
    }
    if (url.pathname !== "/v1/stream") return reject(404, "Not Found");

    const ip = clientIp(req);
    if (!upgradeLimiter.allow(`ws:${ip}`, UPGRADES_PER_IP_PER_MIN).ok) return reject(429, "Too Many Requests");

    const key = requestKey(req, url);
    opts.auth.check(key).then((principal) => {
      if (!principal) return reject(401, "Unauthorized");
      const { label, tier } = principal;
      const limits = LIMITS[tier];
      const open = [...clients].filter((c) => c.label === label).length;
      if (open >= limits.maxConnections) return reject(429, "Too Many Connections");
      if (tier === "free") {
        const fromIp = [...clients].filter((c) => c.tier === "free" && c.ip === ip).length;
        if (fromIp >= MAX_FREE_CONNECTIONS_PER_IP) return reject(429, "Too Many Connections");
      }
      wss.handleUpgrade(req, socket, head, (ws) => accept(ws, key!, label, tier, ip));
    });
  });

  function accept(ws: WebSocket, key: string, label: string, tier: Tier, ip: string) {
    const c: Client = {
      id: nextId++, ws, key, label, tier, ip,
      quotes: null, arbs: null, alive: true,
      realtime: true, pendingPairs: new Set(), pendingArbs: new Map(), nextDigest: 0,
    };
    c.realtime = realtimeRemaining(c) > 0;
    clients.add(c);
    console.log(`client connected (${label}, ${tier}), total ${clients.size}`);
    send(c, {
      type: "welcome",
      tier,
      mode: c.realtime ? "realtime" : "digest",
      realtime_seconds_remaining: finite(realtimeRemaining(c)),
      limits: limitsMsg(LIMITS[tier]),
      pairs: engine.pairs.size,
      open_arbs: engine.arbs.size,
      ts: Date.now(),
    });
    ws.on("message", (raw) => onClientMessage(c, raw.toString()));
    ws.on("pong", () => (c.alive = true));
    ws.on("close", () => {
      clients.delete(c);
      console.log(`client disconnected (${label}), total ${clients.size}`);
    });
  }

  // Drop connections that stop answering pings (e.g. a client that vanished without closing),
  // and re-check keys so revoked or downgraded keys take effect on open connections.
  setInterval(() => {
    opsLimiter.sweep();
    upgradeLimiter.sweep();
    for (const c of clients) {
      if (!c.alive) {
        c.ws.terminate();
        continue;
      }
      c.alive = false;
      c.ws.ping();
      opts.auth.check(c.key).then((p) => {
        if (!p) return c.ws.close(4001, "key inactive");
        c.tier = p.tier;
        if (LIMITS[p.tier].maxArbSnapshot === 0 && c.arbs) {
          c.arbs = null;
          send(c, { type: "unsubscribed", channel: "arbs", reason: "plan no longer includes arbs" });
        }
      });
    }
  }, 30_000);

  setInterval(() => restLimiter.sweep(), 600_000);

  server.listen(opts.port, () => console.log(`OmniPred stream listening on :${opts.port}`));
}
