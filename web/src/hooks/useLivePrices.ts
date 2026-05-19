"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export interface KalshiLivePrice {
  yes_ask: number;
  no_ask: number;
  ts: number;
}

export interface UseLivePricesResult {
  kalshi: Map<string, KalshiLivePrice>;
  poly: Map<string, number>; // poly_market_id -> YES ask price
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
  const [poly, setPoly] = useState<Map<string, number>>(new Map());
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
        // Gamma API supports batching via repeated id params
        const params = polyMarketIds.map((id) => `id=${id}`).join("&");
        const res = await fetch(`https://gamma-api.polymarket.com/markets?${params}`);
        if (!res.ok) return;
        const markets: Array<{
          id: string;
          conditionId?: string;
          outcomePrices?: string | string[];
          price?: number | string;
        }> = await res.json();

        const next = new Map<string, number>();
        for (const m of markets) {
          let yesPrice: number | null = null;

          if (m.outcomePrices) {
            // outcomePrices is sometimes a JSON-stringified array
            const arr: string[] =
              typeof m.outcomePrices === "string"
                ? JSON.parse(m.outcomePrices)
                : m.outcomePrices;
            yesPrice = parseFloat(arr[0]);
          } else if (m.price !== undefined) {
            yesPrice = typeof m.price === "string" ? parseFloat(m.price) : m.price;
          }

          if (yesPrice !== null && !isNaN(yesPrice)) {
            next.set(String(m.id), yesPrice);
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
