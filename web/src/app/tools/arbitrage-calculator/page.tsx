import type { Metadata } from "next";
import Calculator from "./Calculator";

export const metadata: Metadata = {
  title: "Kalshi Fee & Prediction Market Arbitrage Calculator",
  description:
    "Work out Kalshi and Polymarket fees, total cost and net profit for a cross-venue arbitrage, with an annualized return for the time your money is locked up.",
};

export default function CalculatorPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <h1 className="text-2xl sm:text-3xl font-bold text-(--text-primary) mb-2">Arbitrage &amp; fee calculator</h1>
      <p className="text-sm text-(--text-secondary) mb-8 max-w-2xl">
        Enter the price of one side on Kalshi and the opposite side on Polymarket. The calculator adds each venue&apos;s
        trading fee and shows what you&apos;d actually make, and what that works out to per year until the market settles.
      </p>
      <Calculator />
      <div className="mt-10 space-y-3 text-sm text-(--text-secondary) max-w-2xl">
        <h2 className="text-base font-semibold text-(--text-primary)">How the fees are calculated</h2>
        <p>
          Kalshi charges takers <code>0.07 × contracts × price × (1 − price)</code>, rounded up to the next cent per order,
          so fees are highest on contracts priced near 50¢. Polymarket&apos;s fees depend on the market category and on whether
          you use the international or US platform; 5% × price × (1 − price) is a middle-of-the-road estimate. Change either
          rate to match your account.
        </p>
        <p>
          This ignores deposit and withdrawal costs and assumes both orders fill at the prices you enter. Check both
          markets&apos; rules before trading: if they resolve differently, both legs can lose. Not financial advice.
        </p>
      </div>
    </div>
  );
}
