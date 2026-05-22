export function OmnipredLogo({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="OmniPred"
    >
      {/* Left semicircle — Polymarket blue */}
      <path
        d="M12 2.5 A9.5 9.5 0 0 0 12 21.5"
        stroke="#1652F0"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {/* Right semicircle — Kalshi teal */}
      <path
        d="M12 2.5 A9.5 9.5 0 0 1 12 21.5"
        stroke="#00B3A1"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
