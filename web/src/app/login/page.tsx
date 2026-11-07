import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { providerEnabled, safeNext } from "@/lib/oauth";

export const metadata: Metadata = {
  title: "Sign in — OmniPred",
  description: "Sign in to OmniPred to manage your Data Stream API keys and usage.",
  robots: { index: false },
};

const SUPPORT_EMAIL = "support@omnipred.com";

const ERRORS: Record<string, string> = {
  cancelled: "Sign-in was cancelled.",
  state: "That sign-in link expired. Please try again.",
  signin: "We couldn't sign you in. Make sure your account has a verified email and try again.",
  provider: "That sign-in option isn't available right now.",
};

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2.2c-3.3.7-4-1.4-4-1.4-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.2.5-2.3 1.3-3.1-.2-.4-.6-1.6 0-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.6.2 2.8.1 3.2.8.8 1.3 1.9 1.3 3.1 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3" />
    </svg>
  );
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next: rawNext, error } = await searchParams;
  const next = safeNext(rawNext ?? null);
  if (await currentUser()) redirect(next);

  const providers = [
    { id: "google" as const, label: "Continue with Google", icon: <GoogleIcon /> },
    { id: "github" as const, label: "Continue with GitHub", icon: <GitHubIcon /> },
  ].filter((p) => providerEnabled(p.id));

  return (
    <section className="max-w-md mx-auto px-4 sm:px-6 pt-20 sm:pt-28 pb-24">
      <h1 className="text-3xl font-bold tracking-tight text-(--text-primary) mb-2">Sign in to OmniPred</h1>
      <p className="text-(--text-secondary) mb-8">
        Get free API keys for the Data Stream and see your usage. No password needed.
      </p>

      {error && (
        <p role="alert" className="mb-5 text-sm rounded-lg px-3 py-2 bg-(--bg-subtle) text-(--text-primary)">
          {ERRORS[error] ?? ERRORS.signin}
        </p>
      )}

      <div className="space-y-3">
        {providers.map((p) => (
          <a
            key={p.id}
            href={`/api/auth/signin/${p.id}?next=${encodeURIComponent(next)}`}
            className="btn-lift surface w-full inline-flex items-center justify-center gap-3 px-5 py-3 rounded-xl text-sm font-medium text-(--text-primary) hover:bg-(--surface-hover)"
          >
            {p.icon}
            {p.label}
          </a>
        ))}
        {providers.length === 0 && (
          <p className="text-sm text-(--text-secondary)">Sign-in isn&apos;t configured yet. Please check back soon.</p>
        )}
      </div>

      <p className="text-xs text-(--text-muted) mt-8 leading-relaxed">
        By continuing you agree to our <Link href="/terms" className="underline hover:text-(--text-primary)">Terms of Service</Link>{" "}
        and <Link href="/privacy" className="underline hover:text-(--text-primary)">Privacy Policy</Link>. We get your name,
        email address and profile picture from the provider and nothing else.
      </p>
      <p className="text-xs text-(--text-muted) mt-3">
        Trouble signing in? Email{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="underline hover:text-(--text-primary)">{SUPPORT_EMAIL}</a>.
      </p>
    </section>
  );
}
