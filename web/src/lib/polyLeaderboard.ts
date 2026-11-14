// Polymarket's public trader leaderboard (data-api v2), cached per isolate for a few minutes.

export const PERIODS = { DAY: "24 hours", WEEK: "7 days", MONTH: "30 days", ALL: "All time" } as const;
export const SORTS = { PNL: "Profit", VOLUME: "Volume" } as const;
export type Period = keyof typeof PERIODS;
export type Sort = keyof typeof SORTS;

export interface LeaderRow {
  rank: number;
  address: string;
  name: string;
  image: string | null;
  xUsername: string | null;
  verified: boolean;
  pnl: number;
  volume: number;
}

const TTL_MS = 5 * 60_000;
const cache = new Map<string, { at: number; rows: LeaderRow[] }>();

interface ApiRow {
  rank: number;
  user_id: string;
  pnl: number;
  volume: number;
  user_name?: string;
  profile_image?: string;
  x_username?: string;
  verified?: boolean;
}

export async function getLeaderboard(period: Period, sort: Sort, limit = 50): Promise<LeaderRow[]> {
  const key = `${period}:${sort}:${limit}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.rows;

  const url = `https://data-api.polymarket.com/v2/leaderboard?timePeriod=${period}&orderBy=${sort}&limit=${limit}`;
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Polymarket leaderboard: HTTP ${res.status}`);
  const body = (await res.json()) as { data?: ApiRow[] };

  const rows = (body.data ?? []).map((r) => ({
    rank: r.rank,
    address: r.user_id,
    name: r.user_name || `${r.user_id.slice(0, 6)}…${r.user_id.slice(-4)}`,
    image: r.profile_image || null,
    xUsername: r.x_username || null,
    verified: !!r.verified,
    pnl: r.pnl,
    volume: r.volume,
  }));
  cache.set(key, { at: Date.now(), rows });
  return rows;
}
