import Image from "next/image";

export function PolymarketLogo({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <Image
      src="/Polymarket_Favicon.svg"
      alt="Polymarket"
      width={size}
      height={size}
      className={`rounded-sm ${className}`}
    />
  );
}

export function KalshiLogo({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <Image
      src="/Kalshi_Favicon.svg"
      alt="Kalshi"
      width={size}
      height={size}
      className={`rounded-sm ${className}`}
    />
  );
}

export function PlatformLink({
  href,
  platform,
  label,
  size = 16,
}: {
  href: string;
  platform: "polymarket" | "kalshi";
  label?: string;
  size?: number;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1.5 text-xs font-medium transition-opacity hover:opacity-70 ${
        platform === "polymarket" ? "text-[#1652F0] dark:text-[#5b8df8]" : "text-[#00B3A1]"
      }`}
    >
      {platform === "polymarket" ? (
        <PolymarketLogo size={size} />
      ) : (
        <KalshiLogo size={size} />
      )}
      {label || (platform === "polymarket" ? "Polymarket" : "Kalshi")}
    </a>
  );
}
