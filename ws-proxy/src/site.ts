// Calls the website's /api/stream/* endpoints with the shared stream secret.

export class Site {
  constructor(private base: string, private secret: string) {}

  get enabled(): boolean {
    return !!(this.base && this.secret);
  }

  async post<T = unknown>(path: string, body: unknown): Promise<T> {
    return this.call<T>(path, { method: "POST", body: JSON.stringify(body) });
  }

  async get<T = unknown>(path: string): Promise<T> {
    return this.call<T>(path, { method: "GET" });
  }

  /** Retries server errors and timeouts twice: the site's database throttles short write bursts. */
  private async call<T>(path: string, init: RequestInit): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await fetch(`${this.base}${path}`, {
          ...init,
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.secret}` },
          signal: AbortSignal.timeout(20_000),
        });
        if (res.status >= 500 && attempt < 2) throw new Retry(`HTTP ${res.status}`);
        if (!res.ok) throw new Error(`${init.method} ${path}: HTTP ${res.status}`);
        return (await res.json()) as T;
      } catch (e) {
        const retryable = e instanceof Retry || (e instanceof Error && e.name === "TimeoutError");
        if (!retryable || attempt >= 2) throw e;
        await new Promise((r) => setTimeout(r, 3_000 * 3 ** attempt));
      }
    }
  }
}

class Retry extends Error {}
