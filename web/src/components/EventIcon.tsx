"use client";

import { useState } from "react";

interface EventIconProps {
  src?: string | null;
  alt: string;
  size?: number;
  className?: string;
}

export default function EventIcon({ src, alt, size = 40, className = "" }: EventIconProps) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        className={`shrink-0 rounded-xl bg-[--surface] border border-[--border-subtle] flex items-center justify-center text-[--text-muted] ${className}`}
        style={{ width: size, height: size }}
        aria-hidden
      >
        <svg width={size * 0.45} height={size * 0.45} viewBox="0 0 16 16" fill="none">
          <rect x="1" y="3" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <path d="M1 7h14" stroke="currentColor" strokeWidth="1.25" />
          <circle cx="4.5" cy="5.5" r="1" fill="currentColor" />
        </svg>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={`shrink-0 rounded-xl object-cover ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
