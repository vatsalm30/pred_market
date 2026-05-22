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

/** Official Telegram logo (blue gradient circle + white paper plane). */
export function TelegramLogo({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <Image
      src="/telegram-logo.svg"
      alt="Telegram"
      width={size}
      height={size}
      className={className}
    />
  );
}

/** Monochrome paper-plane only — takes currentColor. Use inside buttons over a solid background. */
export function TelegramPlaneIcon({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="45 65 135 110" fill="currentColor" className={className} aria-hidden="true">
      <path d="M81.486,130.178,52.2,120.636s-3.5-1.42-2.373-4.64c.232-.664.7-1.229,2.1-2.2,6.489-4.523,120.106-45.36,120.106-45.36s3.208-1.081,5.1-.362a2.766,2.766,0,0,1,1.885,2.055,9.357,9.357,0,0,1,.254,2.585c-.009.752-.1,1.449-.169,2.542-.692,11.165-21.4,94.493-21.4,94.493s-1.239,4.876-5.678,5.043A8.13,8.13,0,0,1,146.1,172.5c-8.711-7.493-38.819-27.727-45.472-32.177a1.27,1.27,0,0,1-.546-.9c-.093-.469.417-1.05.417-1.05s52.426-46.6,53.821-51.492c.108-.379-.3-.566-.848-.4-3.482,1.281-63.844,39.4-70.506,43.607A3.21,3.21,0,0,1,81.486,130.178Z" />
    </svg>
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
