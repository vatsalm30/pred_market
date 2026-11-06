import Link from "next/link";

export const LEGAL_UPDATED = "November 6, 2026";
export const CONTACT_EMAIL = "vatsalm30@gmail.com";

const LINKS = [
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/cookies", label: "Cookie Policy" },
  { href: "/terms", label: "Terms of Service" },
];

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 sm:pt-20 pb-20">
      <nav className="flex flex-wrap gap-x-4 gap-y-1 text-xs mb-8">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="text-(--text-muted) hover:text-(--text-primary)">
            {l.label}
          </Link>
        ))}
      </nav>
      <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-(--text-primary) mb-2">{title}</h1>
      <p className="text-sm text-(--text-muted) mb-10">Last updated {LEGAL_UPDATED}</p>
      <div className="legal space-y-4 text-(--text-secondary) text-[15px] leading-relaxed">{children}</div>
    </article>
  );
}

export function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-semibold text-(--text-primary) pt-4">{children}</h2>;
}

export function Mail() {
  return (
    <a href={`mailto:${CONTACT_EMAIL}`} className="text-(--kalshi-teal) hover:underline">
      {CONTACT_EMAIL}
    </a>
  );
}
