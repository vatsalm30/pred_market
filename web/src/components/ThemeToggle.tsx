"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

export function useTheme() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const stored = localStorage.getItem("theme") as "dark" | "light" | null;
    const system = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    const resolved = stored ?? system;
    setTheme(resolved);
    document.documentElement.classList.toggle("dark", resolved === "dark");
  }, []);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");
  };

  return { theme, toggle };
}

export default function ThemeToggle() {
  const { toggle } = useTheme();

  return (
    <button
      onClick={toggle}
      aria-label="Toggle theme"
      className="btn-icon w-8 h-8 rounded-lg flex items-center justify-center text-[--text-secondary] hover:text-[--text-primary] hover:bg-[--surface-hover]"
    >
      {/* CSS-driven: no JS state = no hydration flash */}
      <Sun className="w-4 h-4 hidden dark:block" />
      <Moon className="w-4 h-4 block dark:hidden" />
    </button>
  );
}
