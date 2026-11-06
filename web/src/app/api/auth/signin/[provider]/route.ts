import { NextRequest, NextResponse } from "next/server";
import { OAUTH_COOKIE, isProvider, providerEnabled, safeNext, startAuth } from "@/lib/oauth";

export const dynamic = "force-dynamic";

// GET /api/auth/signin/google?next=/dashboard — send the browser to the provider's consent screen.
export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (!isProvider(provider) || !providerEnabled(provider)) {
    return NextResponse.redirect(new URL("/login?error=provider", req.url));
  }
  const redirectUri = `${req.nextUrl.origin}/api/auth/callback/${provider}`;
  const { url, state } = startAuth(provider, redirectUri, safeNext(req.nextUrl.searchParams.get("next")));

  const res = NextResponse.redirect(url);
  res.cookies.set(OAUTH_COOKIE, Buffer.from(JSON.stringify(state)).toString("base64url"), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", // sent on the provider's top-level redirect back to us
    path: "/api/auth/callback",
    maxAge: 600,
  });
  return res;
}
