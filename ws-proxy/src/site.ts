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

  private async call<T>(path: string, init: RequestInit): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.secret}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`${init.method} ${path}: HTTP ${res.status}`);
    return (await res.json()) as T;
  }
}
