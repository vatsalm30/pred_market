import crypto from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Provider, ProviderProfile } from "./users";

// Minimal OAuth 2.0 / OIDC for "Sign in with Google" and "Sign in with GitHub".
// Each flow uses a random state and a PKCE verifier kept in a short-lived cookie.
// Credentials are trimmed: a pasted leading space once sent GitHub an unknown client_id.

export const OAUTH_COOKIE = "op_oauth";

interface ProviderConfig {
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
  clientId: () => string | undefined;
  clientSecret: () => string | undefined;
}

const CONFIG: Record<Provider, ProviderConfig> = {
  google: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scope: "openid email profile",
    clientId: () => process.env.GOOGLE_CLIENT_ID?.trim(),
    clientSecret: () => process.env.GOOGLE_CLIENT_SECRET?.trim(),
  },
  github: {
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    scope: "read:user user:email",
    clientId: () => process.env.GITHUB_CLIENT_ID?.trim(),
    clientSecret: () => process.env.GITHUB_CLIENT_SECRET?.trim(),
  },
};

export const isProvider = (p: string): p is Provider => p === "google" || p === "github";
export const providerEnabled = (p: Provider) => !!CONFIG[p].clientId() && !!CONFIG[p].clientSecret();

const b64url = (buf: Buffer) => buf.toString("base64url");

export interface OAuthState {
  provider: Provider;
  state: string;
  verifier: string;
  next: string;
}

/** Only allow redirects back to a path on this site. */
export const safeNext = (next: string | null) => (next && /^\/(?!\/)/.test(next) ? next : "/dashboard");

export function startAuth(provider: Provider, redirectUri: string, next: string): { url: string; state: OAuthState } {
  const cfg = CONFIG[provider];
  const state = b64url(crypto.randomBytes(24));
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
  const params = new URLSearchParams({
    client_id: cfg.clientId()!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: cfg.scope,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  if (provider === "google") params.set("prompt", "select_account");
  return { url: `${cfg.authorizeUrl}?${params}`, state: { provider, state, verifier, next } };
}

async function exchangeCode(provider: Provider, code: string, redirectUri: string, verifier: string) {
  const cfg = CONFIG[provider];
  const res = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      client_id: cfg.clientId()!,
      client_secret: cfg.clientSecret()!,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
  });
  const body = await res.json();
  if (!res.ok || body.error) throw new Error(`token exchange failed: ${body.error ?? res.status}`);
  return body as { access_token: string; id_token?: string };
}

const googleKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

async function googleProfile(idToken: string): Promise<ProviderProfile> {
  const { payload } = await jwtVerify(idToken, googleKeys, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: CONFIG.google.clientId()!,
  });
  if (!payload.email || payload.email_verified !== true) throw new Error("Google account email is not verified");
  return {
    provider: "google",
    providerUserId: String(payload.sub),
    email: String(payload.email),
    name: String(payload.name ?? payload.email),
    image: typeof payload.picture === "string" ? payload.picture : null,
  };
}

async function githubProfile(accessToken: string): Promise<ProviderProfile> {
  const headers = { Authorization: `Bearer ${accessToken}`, Accept: "application/vnd.github+json", "User-Agent": "OmniPred" };
  const [user, emails] = await Promise.all([
    fetch("https://api.github.com/user", { headers }).then((r) => r.json()),
    fetch("https://api.github.com/user/emails", { headers }).then((r) => r.json()),
  ]);
  const primary = Array.isArray(emails) ? emails.find((e) => e.primary && e.verified) : null;
  if (!primary) throw new Error("GitHub account has no verified primary email");
  return {
    provider: "github",
    providerUserId: String(user.id),
    email: primary.email,
    name: user.name || user.login,
    image: user.avatar_url ?? null,
  };
}

export async function finishAuth(provider: Provider, code: string, redirectUri: string, verifier: string): Promise<ProviderProfile> {
  const tokens = await exchangeCode(provider, code, redirectUri, verifier);
  if (provider === "google") {
    if (!tokens.id_token) throw new Error("Google returned no id_token");
    return googleProfile(tokens.id_token);
  }
  return githubProfile(tokens.access_token);
}
