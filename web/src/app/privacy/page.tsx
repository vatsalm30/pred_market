import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, H2, Mail } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy — OmniPred",
  description: "What personal data OmniPred collects, why, who processes it and how to exercise your rights.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        OmniPred (&quot;we&quot;, &quot;us&quot;) runs omnipred.com, the OmniPred Telegram bot and the OmniPred Data Stream API.
        This policy explains what personal data we collect, why, and the choices you have. We collect as little as we can:
        you can browse the whole site without giving us anything.
      </p>

      <H2>What we collect</H2>
      <ul className="list-disc pl-5 space-y-2">
        <li>
          <strong className="text-(--text-primary)">Browsing the site.</strong> No account needed and no tracking cookies. Our host (Cloudflare) processes
          your IP address and browser details to serve pages and keeps standard server logs. We use Cloudflare Web Analytics,
          which counts page views without cookies and without storing your IP address or building a profile of you.
        </li>
        <li>
          <strong className="text-(--text-primary)">Your account.</strong> If you sign in with Google or GitHub, we receive your
          name, verified email address, profile picture and that provider&apos;s ID for your account. We never see your
          password. A session cookie keeps you signed in (see the{" "}
          <Link href="/cookies" className="text-(--kalshi-teal) hover:underline">Cookie Policy</Link>).
        </li>
        <li>
          <strong className="text-(--text-primary)">API keys and usage.</strong> The names you give your keys, when they were
          created and last used, and a one-way hash of each key (we cannot recover the key itself). When you use the API, our
          stream server (Fly.io) sees your IP address to enforce connection and rate limits, and records daily usage totals
          for your account — streaming minutes, messages, REST requests and connections — which you can see in your dashboard.
        </li>
        <li>
          <strong className="text-(--text-primary)">Telegram alerts.</strong> When you start the bot we store your Telegram chat ID,
          your Telegram username (if you have one) and when you joined, so we can send you alerts. Send <code>/stop</code> to
          unsubscribe and we delete them.
        </li>
        <li>
          <strong className="text-(--text-primary)">Alerts, watchlist and digest.</strong> If you set them up in your
          dashboard we store the Discord webhook URL you give us, your minimum-profit setting, whether you want the daily
          digest, and the markets on your watchlist with their alert thresholds. We use your account email to send watchlist
          alerts and, if you turn it on, the daily digest. Every digest has a one-click unsubscribe link, and removing the
          webhook or watchlist entries deletes them.
        </li>
        <li>
          <strong className="text-(--text-primary)">Emails you send us.</strong> If you contact us, we keep the conversation to reply.
        </li>
      </ul>
      <p>
        We do not collect payment details. We do not sell or rent personal data, share it for cross-context behavioural
        advertising, or use it for automated decisions with legal effects.
      </p>
      <p>
        The site also shows public market data from Polymarket and Kalshi, including public on-chain trades on the Whale
        Tracker, which identify wallets by their public blockchain address only.
      </p>

      <H2>Why we use it (legal bases)</H2>
      <ul className="list-disc pl-5 space-y-2">
        <li>To provide the API, alerts and site you asked for (performance of a contract).</li>
        <li>To keep the service secure and prevent abuse, e.g. rate limiting and server logs (legitimate interests).</li>
        <li>To tell you about changes to the API you signed up for, such as new limits or paid plans (legitimate interests; you can opt out any time).</li>
      </ul>

      <H2>Who processes it for us</H2>
      <ul className="list-disc pl-5 space-y-2">
        <li>Cloudflare, Inc. — website hosting, DNS, email forwarding and cookieless analytics (USA).</li>
        <li>Google and GitHub — only if you choose to sign in with them, under their own privacy policies.</li>
        <li>Amazon Web Services — database storing accounts, API keys, usage, alert settings, watchlists and Telegram subscriptions (USA, us-east-1).</li>
        <li>Fly.io — hosting for the Data Stream server (USA).</li>
        <li>Google Cloud — our market data pipeline, which processes no personal data.</li>
        <li>Telegram — delivers bot messages under its own privacy policy.</li>
        <li>Discord — delivers alerts to the channel whose webhook you connect, under its own privacy policy.</li>
        <li>Resend — sends alert and digest emails (USA).</li>
      </ul>
      <p>
        Pages load market images directly from Polymarket&apos;s image host, and links take you to Polymarket, Kalshi and news
        sites, which have their own privacy policies. If you are outside the USA, your data is transferred to the USA; where
        required we rely on our providers&apos; Standard Contractual Clauses.
      </p>

      <H2>How long we keep it</H2>
      <ul className="list-disc pl-5 space-y-2">
        <li>Account and API keys: until you delete your account (you can do this yourself in the dashboard) or ask us to.</li>
        <li>Daily usage totals: 90 days.</li>
        <li>Telegram chat ID and username: until you send <code>/stop</code> or ask us to delete them.</li>
        <li>Server logs: kept by our hosting providers for their standard retention periods (typically days to weeks).</li>
      </ul>

      <H2>Your rights</H2>
      <p>
        Depending on where you live (including under the GDPR, UK GDPR and California&apos;s CCPA/CPRA), you can ask to access,
        correct, delete or export your personal data, object to or restrict how we use it, and withdraw consent. You can delete
        your account at any time from the dashboard; for anything else email <Mail /> from the address you signed in with and
        we will respond within 30 days. We will not treat you differently for using
        these rights. You can also complain to your local data protection authority.
      </p>

      <H2>Children</H2>
      <p>OmniPred is not intended for anyone under 18, and we do not knowingly collect data from children.</p>

      <H2>Security</H2>
      <p>
        Data is encrypted in transit, API keys are stored only as hashes, and access to our systems is limited to the people
        who run OmniPred. No system is perfectly secure; if a breach affects you we will tell you as the law requires.
      </p>

      <H2>Changes and contact</H2>
      <p>
        We will post changes here and update the date above; for significant changes we will also email API key holders.
        Questions: <Mail />. See also our <Link href="/cookies" className="text-(--kalshi-teal) hover:underline">Cookie Policy</Link>{" "}
        and <Link href="/terms" className="text-(--kalshi-teal) hover:underline">Terms of Service</Link>.
      </p>
    </LegalPage>
  );
}
