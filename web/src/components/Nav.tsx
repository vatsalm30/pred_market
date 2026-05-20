"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import ThemeToggle from "./ThemeToggle";
import { OddsArbLogo } from "./Logo";

const links = [
  { href: "/events", label: "All Markets" },
  { href: "/arbitrage", label: "Arbitrage" },
];

export default function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-[--border-subtle] bg-[--bg]/90 backdrop-blur-xl">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          <Link href="/" className="nav-logo flex items-center gap-2">
            <OddsArbLogo size={22} />
            <span className="font-bold text-base tracking-tight text-[--text-primary]">OddsArb</span>
            <span className="text-[--text-muted] font-normal text-xs hidden sm:inline">— prediction market comparison</span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`nav-link px-3 py-1.5 rounded-lg text-sm ${
                  pathname === l.href
                    ? "text-[--text-primary] bg-[--surface]"
                    : "text-[--text-secondary] hover:text-[--text-primary] hover:bg-[--surface-hover]"
                }`}
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <div className="hidden md:flex items-center gap-1.5 text-xs text-[--kalshi-teal] pr-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[--kalshi-teal] live-dot" />
              Live
            </div>
            <ThemeToggle />
            <button onClick={() => setOpen(!open)} className="btn-icon md:hidden text-[--text-secondary] hover:text-[--text-primary] p-1.5">
              {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {open && (
        <div className="md:hidden border-t border-[--border-subtle] bg-[--bg] px-4 py-3 space-y-1">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className={`block px-3 py-2.5 rounded-lg text-sm transition-colors ${
                pathname === l.href
                  ? "text-[--text-primary] bg-[--surface]"
                  : "text-[--text-secondary] hover:text-[--text-primary]"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </div>
      )}
    </header>
  );
}
