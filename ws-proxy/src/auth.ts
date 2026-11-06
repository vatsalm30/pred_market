export type Tier = "free" | "quotes" | "pro";

export interface Principal {
  label: string; // identifies the subscriber for limits and logs
  tier: Tier;
}

export interface AuthOptions {
  staticKeys: Map<string, string>; // key -> label, always "pro" (internal/testing keys)
  verifyUrl: string;               // the website's /api/stream/verify endpoint
  verifySecret: string;
}

const HIT_TTL_MS = 60_000;  // a revoked key loses access within a minute
const MISS_TTL_MS = 10_000;

/** Resolves API keys: static keys from env first, then subscriber keys via the website. */
export class Auth {
  private cache = new Map<string, { principal: Principal | null; expires: number }>();

  constructor(private opts: AuthOptions) {}

  async check(key: string | null): Promise<Principal | null> {
    if (!key) return null;
    const label = this.opts.staticKeys.get(key);
    if (label) return { label, tier: "pro" };

    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) return cached.principal;
    if (!this.opts.verifyUrl || !this.opts.verifySecret) return null;

    let principal: Principal | null = null;
    try {
      const res = await fetch(`${this.opts.verifyUrl}?key=${encodeURIComponent(key)}`, {
        headers: { Authorization: `Bearer ${this.opts.verifySecret}` },
        signal: AbortSignal.timeout(5_000),
      });
      if (!res.ok) {
        // Verification is down: keep serving a key we already knew rather than cutting off subscribers.
        return cached?.principal ?? null;
      }
      const body = (await res.json()) as { active: boolean; tier?: Tier; label?: string };
      if (body.active && body.tier) principal = { label: body.label ?? key.slice(0, 12), tier: body.tier };
    } catch {
      return cached?.principal ?? null;
    }
    this.cache.set(key, { principal, expires: Date.now() + (principal ? HIT_TTL_MS : MISS_TTL_MS) });
    return principal;
  }
}
