// What each tier allows, for display. The stream service enforces the real values
// (ws-proxy/src/limits.ts) — keep the two in sync.

export const FREE_LIMITS = {
  realtimeSecondsPerDay: 15 * 60,
  digestSeconds: 30,
  maxQuotePairs: 25,
  maxArbSnapshot: 20,
  connectionsPerAccount: 1,
  messagesPer10s: 10,
  restPerHour: 60,
  keysPerAccount: 3,
};

export const STREAM_URL = process.env.NEXT_PUBLIC_STREAM_URL ?? "wss://pred-market.fly.dev/v1/stream";
export const REST_URL = STREAM_URL.replace(/^ws/, "http").replace(/\/v1\/stream$/, "");
