"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Check, Copy } from "lucide-react";

type State = { status: "pending" } | { status: "ready"; key: string } | { status: "revealed" } | { status: "error" };

const POLL_MS = 2_000;
const MAX_POLLS = 30;

export default function SuccessPage({ searchParams }: { searchParams: Promise<{ session_id?: string }> }) {
  const { session_id } = use(searchParams);
  const [state, setState] = useState<State>({ status: "pending" });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!session_id) return setState({ status: "error" });
    let polls = 0;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const res = await fetch(`/api/stream/key?session_id=${encodeURIComponent(session_id)}`, { cache: "no-store" });
        const body = await res.json();
        if (body.status === "ready" || body.status === "revealed") return setState(body);
      } catch {}
      if (++polls >= MAX_POLLS) return setState({ status: "revealed" });
      timer = setTimeout(poll, POLL_MS);
    };
    poll();
    return () => clearTimeout(timer);
  }, [session_id]);

  const copy = async (key: string) => {
    await navigator.clipboard.writeText(key);
    setCopied(true);
  };

  return (
    <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 sm:pt-20 pb-20">
      <h1 className="text-3xl font-bold tracking-tight text-(--text-primary) mb-3">You&apos;re subscribed</h1>

      {state.status === "pending" && <p className="text-(--text-secondary)">Issuing your API key…</p>}

      {state.status === "ready" && (
        <>
          <p className="text-(--text-secondary) mb-4">
            Here is your API key. <strong className="text-(--text-primary)">It is shown only once</strong>, so store it somewhere safe now.
          </p>
          <div className="surface rounded-xl p-4 flex items-center gap-3">
            <code className="flex-1 font-mono text-sm text-(--text-primary) break-all">{state.key}</code>
            <button onClick={() => copy(state.key)} className="px-3 py-2 rounded-lg bg-(--bg-subtle) text-sm text-(--text-primary) inline-flex items-center gap-1.5">
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </>
      )}

      {state.status === "revealed" && (
        <p className="text-(--text-secondary)">
          This key has already been shown. If you lost it, contact us and we&apos;ll issue a new one; if you still have it,
          you can rotate it from the developers page.
        </p>
      )}

      {state.status === "error" && <p className="text-(--text-secondary)">This link is missing its checkout session.</p>}

      <p className="text-sm text-(--text-secondary) mt-8">
        Next: <Link href="/developers#docs" className="text-(--kalshi-teal) hover:underline">connect to the stream</Link>.
        Manage billing any time from the <Link href="/developers" className="text-(--kalshi-teal) hover:underline">developers page</Link>.
      </p>
    </section>
  );
}
