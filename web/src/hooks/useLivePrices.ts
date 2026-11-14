"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export interface KalshiLivePrice {
  yes_ask: number;
  no_ask: number;
  ts: number;
}

export interface PolyLivePrice {
  yes_ask: number;
  no_ask: number;
}

export interface UseLivePricesResult {
  kalshi: Map<string, KalshiLivePrice>;
  poly: Map<string, PolyLivePrice>; // poly_market_id -> best asks
  connected: boolean;
  lastPolyFetch: Date | null;
}

// How often to poll Polymarket Gamma API (ms)
const POLY_POLL_MS = 30_000;

export function useLivePrices(
  kalshiTickers: string[],
  polyMarketIds: string[]
): UseLivePricesResult {
  const [kalshi, setKalshi] = useState<Map<string, KalshiLivePrice>>(new Map());
  const [poly, setPoly] = useState<Map<string, PolyLivePrice>>(new Map());
  const [connected, setConnected] = useState(false);
  const [lastPolyFetch, setLastPolyFetch] = useState<Date | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const PROXY_URL = process.env.NEXT_PUBLIC_WS_PROXY_URL;

  // ── Kalshi via WebSocket proxy ─────────────────────────────────────────────
  const connectWs = useCallback(() => {
    if (!PROXY_URL) return;

    const ws = new WebSocket(PROXY_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data as string);
        if (msg.type === "kalshi_price") {
          setKalshi((prev) => {
            const next = new Map(prev);
            next.set(msg.market_ticker, {
              yes_ask: msg.yes_ask,
              no_ask: msg.no_ask,
              ts: msg.ts ?? Date.now(),
            });
            return next;
          });
        }
      } catch {}
    };

    ws.onclose = () => {
      setConnected(false);
      // Reconnect with backoff
      reconnectTimer.current = setTimeout(connectWs, 5_000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [PROXY_URL]);

  useEffect(() => {
    if (!PROXY_URL || kalshiTickers.length === 0) return;
    connectWs();
    return () => {
      wsRef.current?.close();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, [PROXY_URL, connectWs]);

  // ── Polymarket via Gamma API polling ──────────────────────────────────────
  useEffect(() => {
    if (polyMarketIds.length === 0) return;

    const fetchPoly = async () => {
      try {
        // Gamma batches by repeated id params but pages at 20 unless a limit is given.
        // bestAsk/bestBid are the real top of book; outcomePrices is only the midpoint.
        const next = new Map<string, PolyLivePrice>();
        for (let i = 0; i < polyMarketIds.length; i += 50) {
          const params = polyMarketIds.slice(i, i + 50).map((id) => `id=${id}`).join("&");
          const res = await fetch(`https://gamma-api.polymarket.com/markets?${params}&limit=100`);
          if (!res.ok) continue;
          const markets: Array<{ id: string; bestAsk?: number | string; bestBid?: number | string }> = await res.json();
          for (const m of markets) {
            const ask = Number(m.bestAsk), bid = Number(m.bestBid);
            if (Number.isFinite(ask) && Number.isFinite(bid) && ask > 0 && bid > 0) {
              next.set(String(m.id), { yes_ask: ask, no_ask: 1 - bid });
            }
          }
        }

        setPoly(next);
        setLastPolyFetch(new Date());
      } catch {}
    };

    fetchPoly();
    const interval = setInterval(fetchPoly, POLY_POLL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polyMarketIds.join(",")]);

  return { kalshi, poly, connected, lastPolyFetch };
}
