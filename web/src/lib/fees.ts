// Estimated taker fees, per $1 contract, for judging whether a gap survives costs.
// Kalshi: 0.07 × P × (1 − P), from its published fee schedule (rounded up to the cent per order).
// Polymarket: varies by category and platform (roughly 0.03–0.07 × P × (1 − P)); 0.05 is a mid-range estimate.

export const KALSHI_FEE_RATE = 0.07;
export const POLY_FEE_RATE = 0.05;

const takerFee = (rate: number, price: number) => rate * price * (1 - price);

/** Profit % after estimated fees on both legs; negative means the trade loses money. */
export function netAfterFeesPct(kalshiAsk: number, polyAsk: number): number {
  const cost = kalshiAsk + polyAsk + takerFee(KALSHI_FEE_RATE, kalshiAsk) + takerFee(POLY_FEE_RATE, polyAsk);
  return ((1 - cost) / cost) * 100;
}

export const FEE_NOTE =
  "Estimated with Kalshi's taker fee (7% × P × (1−P)) and 5% × P × (1−P) for Polymarket, whose fees vary by category. Excludes deposit, withdrawal and slippage costs.";
