import type { Pair } from "./types";

const GAMMA_URL = "https://gamma-api.polymarket.com/markets";
const GAMMA_BATCH = 50;

interface MatchedRow {
  kalshi_market_id: string;
  poly_market_id: string | number;
  poly_event: string;
  kalshi_event: string;
  poly_label: string;
  kalshi_label: string;
  event_score: number;
  outcome_score: number;
  poly_end_date?: string | null;
  kalshi_end_date?: string | null;
  poly_url?: string;
  kalshi_url?: string;
}

/** Outcome token ids (YES, NO) for each open Polymarket market. */
async function fetchPolyTokens(ids: string[]): Promise<Map<string, [string, string]>> {
  const tokens = new Map<string, [string, string]>();
  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += GAMMA_BATCH) batches.push(ids.slice(i, i + GAMMA_BATCH));

  // A few requests in flight at once keeps a full refresh to a few seconds.
  const worker = async () => {
    for (let batch = batches.shift(); batch; batch = batches.shift()) {
      try {
        // Gamma pages at 20 unless told otherwise, which silently dropped 60% of each batch
        const res = await fetch(`${GAMMA_URL}?${batch.map((id) => `id=${id}`).join("&")}&limit=${GAMMA_BATCH * 2}`);
        if (!res.ok) continue;
        for (const m of (await res.json()) as any[]) {
          if (m.closed || !m.clobTokenIds) continue;
          const ids: string[] = JSON.parse(m.clobTokenIds);
          const outcomes: string[] = m.outcomes ? JSON.parse(m.outcomes) : ["Yes", "No"];
          const yes = Math.max(0, outcomes.findIndex((o) => o.toLowerCase() === "yes"));
          if (ids.length === 2) tokens.set(String(m.id), [ids[yes], ids[1 - yes]]);
        }
      } catch (err) {
        console.error("gamma:", err instanceof Error ? err.message : err);
      }
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  return tokens;
}

/** Load the pipeline's matched markets and attach Polymarket token ids. Closed markets drop out. */
export async function loadPairs(url: string): Promise<Pair[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`matched markets: HTTP ${res.status}`);
  const rows = (await res.json()) as MatchedRow[];
  const tokens = await fetchPolyTokens([...new Set(rows.map((r) => String(r.poly_market_id)))]);

  const pairs: Pair[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const polyId = String(r.poly_market_id);
    const t = tokens.get(polyId);
    const pairId = `${r.kalshi_market_id}:${polyId}`;
    if (!t || !r.kalshi_market_id || seen.has(pairId)) continue;
    seen.add(pairId);
    pairs.push({
      pair_id: pairId,
      kalshi_ticker: r.kalshi_market_id,
      poly_market_id: polyId,
      poly_yes_token: t[0],
      poly_no_token: t[1],
      poly_event: r.poly_event,
      kalshi_event: r.kalshi_event,
      poly_label: r.poly_label,
      kalshi_label: r.kalshi_label,
      event_score: Number(r.event_score),
      outcome_score: Number(r.outcome_score),
      poly_end_date: r.poly_end_date ?? null,
      kalshi_end_date: r.kalshi_end_date ?? null,
      poly_url: r.poly_url ?? "",
      kalshi_url: r.kalshi_url ?? "",
    });
  }
  return pairs;
}
