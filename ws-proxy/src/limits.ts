import type { Tier } from "./auth";

export interface TierLimits {
  maxConnections: number;        // per key
  maxQuotePairs: number;         // Infinity = may subscribe to every pair
  maxArbSnapshot: number;        // arbs sent in a subscribe snapshot / REST response
  realtimeSecondsPerDay: number; // streaming time with per-change pushes; then digests
  digestIntervalMs: number;      // how often digests go out once the realtime budget is spent
  opsPer10s: number;             // client messages (subscribe, ping, …)
  restPerHour: number;
}

const env = (name: string, fallback: number) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

export const LIMITS: Record<Tier, TierLimits> = {
  free: {
    maxConnections: 1,
    maxQuotePairs: env("FREE_MAX_PAIRS", 25),
    maxArbSnapshot: 20,
    realtimeSecondsPerDay: env("FREE_REALTIME_MINUTES", 15) * 60,
    digestIntervalMs: env("FREE_DIGEST_SECONDS", 30) * 1000,
    opsPer10s: 10,
    restPerHour: env("FREE_REST_PER_HOUR", 60),
  },
  quotes: {
    maxConnections: 5,
    maxQuotePairs: Infinity,
    maxArbSnapshot: 0,
    realtimeSecondsPerDay: Infinity,
    digestIntervalMs: 0,
    opsPer10s: 50,
    restPerHour: 3600,
  },
  pro: {
    maxConnections: 5,
    maxQuotePairs: Infinity,
    maxArbSnapshot: Infinity,
    realtimeSecondsPerDay: Infinity,
    digestIntervalMs: 0,
    opsPer10s: 50,
    restPerHour: 3600,
  },
};

// Connections from one IP across all free keys, so one person can't stack keys.
export const MAX_FREE_CONNECTIONS_PER_IP = env("FREE_MAX_CONN_PER_IP", 3);

const utcDay = () => new Date().toISOString().slice(0, 10);

/**
 * Seconds of realtime streaming used per subscriber today (UTC). Kept in memory:
 * a restart hands out a fresh budget, which is acceptable for a free tier.
 */
export class RealtimeBudget {
  private used = new Map<string, number>();
  private day = utcDay();

  private roll() {
    const today = utcDay();
    if (today !== this.day) {
      this.day = today;
      this.used.clear();
    }
  }

  usedSeconds(label: string): number {
    this.roll();
    return this.used.get(label) ?? 0;
  }

  /** Take the larger of our count and the website's, e.g. after a restart. */
  seed(label: string, seconds: number) {
    this.roll();
    if (seconds > (this.used.get(label) ?? 0)) this.used.set(label, seconds);
  }

  add(label: string, seconds: number) {
    this.roll();
    this.used.set(label, (this.used.get(label) ?? 0) + seconds);
  }

  /** ms until budgets reset at 00:00 UTC. */
  static msUntilReset(): number {
    const now = new Date();
    return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now.getTime();
  }
}

/**
 * Fixed-window counter: allow(key) is false once `limit` hits in the current window.
 * Holds at most `maxKeys` windows so a flood from many IPs can't exhaust memory; past
 * that it drops expired windows, then everything (briefly under-limiting beats crashing).
 */
export class WindowLimiter {
  private counts = new Map<string, { start: number; n: number }>();

  constructor(private windowMs: number, private maxKeys = 50_000) {}

  allow(key: string, limit: number): { ok: boolean; remaining: number; resetMs: number } {
    const now = Date.now();
    if (this.counts.size >= this.maxKeys && !this.counts.has(key)) {
      this.sweep();
      if (this.counts.size >= this.maxKeys) this.counts.clear();
    }
    let w = this.counts.get(key);
    if (!w || now - w.start >= this.windowMs) {
      w = { start: now, n: 0 };
      this.counts.set(key, w);
    }
    w.n++;
    return { ok: w.n <= limit, remaining: Math.max(0, limit - w.n), resetMs: w.start + this.windowMs - now };
  }

  sweep() {
    const now = Date.now();
    for (const [k, w] of this.counts) if (now - w.start >= this.windowMs) this.counts.delete(k);
  }
}
