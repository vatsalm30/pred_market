import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, H2, Mail } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Cookie Policy — OmniPred",
  description: "OmniPred sets no cookies. Here is what little we store in your browser and why.",
};

export default function CookiesPage() {
  return (
    <LegalPage title="Cookie Policy">
      <p>
        <strong className="text-(--text-primary)">OmniPred only sets cookies when you sign in</strong>, and only the ones needed to
        keep you signed in. We do not use advertising, analytics or cross-site tracking cookies. That is why you don&apos;t see a
        cookie banner.
      </p>

      <H2>Cookies</H2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-(--text-primary)">
              <th className="py-2 pr-4 border-b border-(--border)">Name</th>
              <th className="py-2 pr-4 border-b border-(--border)">Purpose</th>
              <th className="py-2 border-b border-(--border)">Expires</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="py-2 pr-4 border-b border-(--border-subtle) font-mono">op_session</td>
              <td className="py-2 pr-4 border-b border-(--border-subtle)">Keeps you signed in to your account (set only after you sign in)</td>
              <td className="py-2 border-b border-(--border-subtle)">30 days, or when you sign out</td>
            </tr>
            <tr>
              <td className="py-2 pr-4 border-b border-(--border-subtle) font-mono">op_oauth</td>
              <td className="py-2 pr-4 border-b border-(--border-subtle)">Protects the Google/GitHub sign-in step against forgery</td>
              <td className="py-2 border-b border-(--border-subtle)">10 minutes</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>Both are first-party, strictly necessary for a service you asked for, and are not used for tracking, so they do not require consent.</p>

      <H2>What else we store in your browser</H2>
      <p>
        A couple of settings are saved in your browser&apos;s local storage so the site remembers choices you made. They never
        leave your device and you can clear them at any time in your browser settings.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-(--text-primary)">
              <th className="py-2 pr-4 border-b border-(--border)">Name</th>
              <th className="py-2 pr-4 border-b border-(--border)">Purpose</th>
              <th className="py-2 border-b border-(--border)">Kept until</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="py-2 pr-4 border-b border-(--border-subtle) font-mono">theme</td>
              <td className="py-2 pr-4 border-b border-(--border-subtle)">Remembers light or dark mode</td>
              <td className="py-2 border-b border-(--border-subtle)">You clear it</td>
            </tr>
            <tr>
              <td className="py-2 pr-4 border-b border-(--border-subtle) font-mono">event filters</td>
              <td className="py-2 pr-4 border-b border-(--border-subtle)">Remembers your filters on All Markets</td>
              <td className="py-2 border-b border-(--border-subtle)">You clear it</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>These are strictly necessary for features you use, so they do not require consent.</p>

      <H2>Analytics</H2>
      <p>
        We use Cloudflare Web Analytics to count page views. It works without cookies or local storage and does not store your IP
        address or track you across sites or visits.
      </p>

      <H2>Third-party content</H2>
      <p>
        Market images load from Polymarket&apos;s image host, and links lead to Polymarket, Kalshi, Telegram, X and news sites.
        Those sites may set their own cookies once you visit them; their policies apply.
      </p>

      <H2>Changes and contact</H2>
      <p>
        If we ever add cookies that need consent, we will update this page and ask for your consent first. Google and GitHub
        set their own cookies on their sign-in pages under their policies. Questions: <Mail />.
        See also our <Link href="/privacy" className="text-(--kalshi-teal) hover:underline">Privacy Policy</Link>.
      </p>
    </LegalPage>
  );
}
