import Link from "next/link";

const TABS = [
  { href: "/whale", label: "Live trades" },
  { href: "/whale/leaderboard", label: "Top traders" },
];

/** Switches between the whale trade feed and the trader leaderboard. */
export default function WhaleTabs({ active }: { active: string }) {
  return (
    <nav className="inline-flex rounded-xl surface p-1 text-sm mb-6" aria-label="Whale tracker views">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.href === active ? "page" : undefined}
          className={`px-3 py-1.5 rounded-lg ${
            t.href === active
              ? "bg-(--bg-subtle) text-(--text-primary) font-medium"
              : "text-(--text-secondary) hover:text-(--text-primary)"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
