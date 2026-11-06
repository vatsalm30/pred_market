import crypto from "node:crypto";

interface Counters {
  realtime_s: number;
  rest: number;
  messages: number;
  updates: number;
  connects: number;
  keyHashes: Set<string>;
}

export interface LiveState {
  connections: number;
  mode: "realtime" | "digest" | null;
}

const REPORT_MS = 60_000;
const zero = (): Counters => ({ realtime_s: 0, rest: 0, messages: 0, updates: 0, connects: 0, keyHashes: new Set() });

/**
 * Per-account usage counters, flushed to the website every minute so the API
 * dashboard can show them. Counts that fail to send are kept for the next flush.
 */
export class UsageReporter {
  private counts = new Map<string, Counters>();
  private reportable = new Set<string>();

  constructor(private url: string, private secret: string, private live: () => Map<string, LiveState>) {
    if (url && secret) setInterval(() => this.flush(), REPORT_MS);
  }

  /** Only accounts verified by the website are reported (not static env keys). */
  track(label: string, key: string, fromSite: boolean) {
    if (fromSite) this.reportable.add(label);
    this.bump(label, "connects", 1);
    this.get(label).keyHashes.add(crypto.createHash("sha256").update(key).digest("hex"));
  }

  bump(label: string, field: Exclude<keyof Counters, "keyHashes">, n: number) {
    this.get(label)[field] += n;
  }

  restRequest(label: string, key: string, fromSite: boolean) {
    if (fromSite) this.reportable.add(label);
    this.bump(label, "rest", 1);
    this.get(label).keyHashes.add(crypto.createHash("sha256").update(key).digest("hex"));
  }

  private get(label: string): Counters {
    let c = this.counts.get(label);
    if (!c) this.counts.set(label, (c = zero()));
    return c;
  }

  private async flush() {
    const live = this.live();
    const labels = new Set([...this.counts.keys(), ...live.keys()]);
    const pending = this.counts;
    this.counts = new Map();
    const reports = [...labels]
      .filter((l) => this.reportable.has(l))
      .map((label) => {
        const c = pending.get(label) ?? zero();
        const l = live.get(label);
        return {
          label,
          realtime_s: c.realtime_s,
          rest: c.rest,
          messages: c.messages,
          updates: c.updates,
          connects: c.connects,
          key_hashes: [...c.keyHashes],
          connections: l?.connections ?? 0,
          mode: l?.mode ?? null,
        };
      });
    if (reports.length === 0) return;
    try {
      const res = await fetch(this.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.secret}` },
        body: JSON.stringify({ reports }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      console.error("usage report failed:", err instanceof Error ? err.message : err);
      for (const [label, c] of pending) {
        const cur = this.get(label);
        for (const f of ["realtime_s", "rest", "messages", "updates", "connects"] as const) cur[f] += c[f];
        for (const h of c.keyHashes) cur.keyHashes.add(h);
      }
    }
  }
}
