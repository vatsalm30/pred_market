import { NextRequest, NextResponse } from "next/server";
import { OAUTH_COOKIE, finishAuth, isProvider, type OAuthState } from "@/lib/oauth";
import { createSession } from "@/lib/session";
import { upsertUser } from "@/lib/users";

export const dynamic = "force-dynamic";

// GET /api/auth/callback/<provider>?code=…&state=… — the provider sends the browser back here.
export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const fail = (error: string) => {
    const res = NextResponse.redirect(new URL(`/login?error=${error}`, req.url));
    res.cookies.set(OAUTH_COOKIE, "", { path: "/api/auth/callback", maxAge: 0 });
    return res;
  };

  let saved: OAuthState | null = null;
  try {
    const raw = req.cookies.get(OAUTH_COOKIE)?.value;
    saved = raw ? (JSON.parse(Buffer.from(raw, "base64url").toString()) as OAuthState) : null;
  } catch {}

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (req.nextUrl.searchParams.get("error")) return fail("cancelled");
  if (!isProvider(provider) || !saved || saved.provider !== provider || !code || state !== saved.state) {
    return fail("state");
  }

  try {
    const profile = await finishAuth(provider, code, `${req.nextUrl.origin}/api/auth/callback/${provider}`, saved.verifier);
    const user = await upsertUser(profile);
    const res = NextResponse.redirect(new URL(saved.next, req.url));
    res.cookies.set(OAUTH_COOKIE, "", { path: "/api/auth/callback", maxAge: 0 });
    await createSession(res, user.id);
    return res;
  } catch (e) {
    console.error(`auth ${provider}:`, (e as Error).message);
    return fail("signin");
  }
}
