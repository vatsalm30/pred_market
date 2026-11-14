// A Polymarket trader's public profile, from Polymarket's data API (v2). Cached per isolate.

const API = "https://data-api.polymarket.com/v2";
const TTL_MS = 5 * 60_000;
const cache = new Map<string, { at: number; value: TraderProfile }>();

export const isAddress = (a: string) => /^0x[0-9a-fA-F]{40}$/.test(a);

export interface TraderProfile {
  address: string;
  name: string;
  image: string | null;
  xUsername: string | null;
  allTime: { pnl: number; volume: number; rankPnl: number | null } | null;
  month: { pnl: number; volume: number; rankPnl: number | null } | null;
  portfolioValue: number | null;
  positions: { title: string; outcome: string; slug: string; value: number; pnl: number; avgPrice: number; curPrice: number; icon: string | null }[];
  trades: { title: string; outcome: string; slug: string; side: "BUY" | "SELL"; usd: number; price: number; ts: number; tx: string | null }[];
  titles: string[]; // markets traded recently, for category breakdown
}

async function get<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API}${path}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return ((await res.json()) as { data: T }).data;
  } catch {
    return null;
  }
}

interface LbRow { pnl: number; volume: number; rank_pnl?: number; user_name?: string; profile_image?: string; x_username?: string }
interface PosRow { title: string; outcome: string; event_slug: string; current_value: number; total_pnl: number; avg_price: number; current_price: number; icon?: string; name?: string; profile_image?: string }
interface TradeRow { title: string; outcome: string; event_slug: string; side: "BUY" | "SELL"; size: number; price: number; timestamp: number; transaction_hash?: string; name?: string; profile_image?: string }

export async function getTrader(address: string): Promise<TraderProfile> {
  const key = address.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  const [all, month, worth, positions, trades] = await Promise.all([
    get<LbRow>(`/leaderboard?user=${key}&timePeriod=ALL`),
    get<LbRow>(`/leaderboard?user=${key}&timePeriod=MONTH`),
    get<{ value: number }>(`/value?user=${key}`),
    get<PosRow[]>(`/positions?user=${key}&status=OPEN&limit=10`),
    get<TradeRow[]>(`/trades?user=${key}&limit=100`),
  ]);

  const value: TraderProfile = {
    address: key,
    name: all?.user_name || trades?.[0]?.name || positions?.[0]?.name || `${key.slice(0, 6)}…${key.slice(-4)}`,
    image: all?.profile_image || trades?.[0]?.profile_image || null,
    xUsername: all?.x_username || null,
    allTime: all ? { pnl: all.pnl, volume: all.volume, rankPnl: all.rank_pnl ?? null } : null,
    month: month ? { pnl: month.pnl, volume: month.volume, rankPnl: month.rank_pnl ?? null } : null,
    portfolioValue: worth?.value ?? null,
    positions: (positions ?? []).map((p) => ({
      title: p.title, outcome: p.outcome, slug: p.event_slug, value: p.current_value, pnl: p.total_pnl,
      avgPrice: p.avg_price, curPrice: p.current_price, icon: p.icon || null,
    })),
    trades: (trades ?? []).map((t) => ({
      title: t.title, outcome: t.outcome, slug: t.event_slug, side: t.side, usd: t.size * t.price, price: t.price,
      ts: t.timestamp, tx: t.transaction_hash ?? null,
    })),
    titles: [...(trades ?? []).map((t) => t.title), ...(positions ?? []).map((p) => p.title)],
  };
  cache.set(key, { at: Date.now(), value });
  return value;
}
