import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, H2, Mail } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Service — OmniPred",
  description: "The terms for using omnipred.com, the OmniPred Telegram bot and the OmniPred Data Stream API.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service">
      <p>
        These terms apply to omnipred.com, the OmniPred Telegram bot and the OmniPred Data Stream API (together, the
        &quot;Service&quot;). By using the Service you agree to them. If you don&apos;t agree, please don&apos;t use it.
      </p>

      <H2>1. What OmniPred is — and isn&apos;t</H2>
      <p>
        OmniPred compares publicly available prices from prediction markets such as Polymarket and Kalshi. We are{" "}
        <strong className="text-(--text-primary)">not affiliated with, endorsed by or a partner of Polymarket or Kalshi</strong>.
        We do not offer trading, hold funds, execute orders or act as a broker, exchange or adviser.
      </p>

      <H2>2. Not financial advice</H2>
      <p>
        Everything on the Service — prices, matched markets, &quot;arbitrage&quot; figures, alerts, blog posts and news commentary — is
        information only, not financial, investment, legal or tax advice, and not a recommendation to trade. Markets are
        matched automatically and can be wrong: two markets that look alike may have different rules, end dates or
        resolution sources, so an apparent arbitrage can lose money on both sides. Profit figures exclude fees, slippage and
        the cost of tying up capital. Always read each market&apos;s rules and make your own decisions. You are solely
        responsible for your trades.
      </p>

      <H2>3. Eligibility and local laws</H2>
      <p>
        You must be at least 18 to use the Service. Prediction markets are restricted or illegal in some places. It is your
        responsibility to follow the laws that apply to you and the terms of any platform you trade on.
      </p>

      <H2>4. Data accuracy and availability</H2>
      <p>
        Data comes from third parties and is provided &quot;as is&quot;. It may be delayed, incomplete or incorrect, and the Service
        may be interrupted, changed or discontinued at any time without notice.
      </p>

      <H2>5. Accounts and the Data Stream API</H2>
      <ul className="list-disc pl-5 space-y-2">
        <li>You can sign in with Google or GitHub. One account per person; keep your sign-in secure. You can delete your account at any time from the dashboard.</li>
        <li>The API is currently a free beta with the limits shown on the <Link href="/developers" className="text-(--kalshi-teal) hover:underline">developers page</Link>. We may change limits, introduce paid plans or end the beta; we will give API key holders notice by email where we reasonably can.</li>
        <li>Keep your keys secret. You are responsible for activity under them. Limits apply per account; don&apos;t create multiple accounts to get around them.</li>
        <li>Don&apos;t resell, redistribute or publicly republish the raw feed, or build a competing data service from it, without our written permission. You may use it in your own trading tools and show derived results to your users.</li>
        <li>Don&apos;t attempt to bypass rate limits, overload the service, probe it for vulnerabilities or access it other than through the documented interfaces.</li>
        <li>We may suspend or revoke keys that break these terms or put the Service at risk.</li>
      </ul>

      <H2>6. Acceptable use</H2>
      <p>
        Don&apos;t use the Service to break the law, scrape the site at a rate that degrades it, interfere with other users, or
        misrepresent our data as your own or as coming from Polymarket or Kalshi.
      </p>

      <H2>7. Intellectual property</H2>
      <p>
        The OmniPred name, site design, matching, analysis and written content belong to us. Market data belongs to its
        respective sources. Polymarket and Kalshi names and logos are trademarks of their owners and are used only to
        identify their markets. News items link to and briefly comment on articles owned by their publishers.
      </p>

      <H2>8. Disclaimer of warranties</H2>
      <p>
        To the fullest extent permitted by law, the Service is provided &quot;as is&quot; and &quot;as available&quot;, without warranties of any
        kind, express or implied, including merchantability, fitness for a particular purpose, accuracy and non-infringement.
      </p>

      <H2>9. Limitation of liability</H2>
      <p>
        To the fullest extent permitted by law, OmniPred will not be liable for any trading losses, lost profits or indirect,
        incidental, special or consequential damages arising from your use of the Service. Our total liability for any claim
        is limited to the greater of the amount you paid us in the 12 months before the claim or US$50. Some jurisdictions
        do not allow these limits, so they may not fully apply to you.
      </p>

      <H2>10. Indemnity</H2>
      <p>
        You agree to indemnify OmniPred against claims arising from your misuse of the Service or your breach of these terms.
      </p>

      <H2>11. Changes and termination</H2>
      <p>
        We may update these terms; the date above shows the latest version, and continuing to use the Service means you
        accept them. You can stop using the Service at any time. We may suspend or end access if you break these terms.
      </p>

      <H2>12. Contact</H2>
      <p>
        Questions about these terms: <Mail />. How we handle personal data is described in our{" "}
        <Link href="/privacy" className="text-(--kalshi-teal) hover:underline">Privacy Policy</Link>.
      </p>
    </LegalPage>
  );
}
