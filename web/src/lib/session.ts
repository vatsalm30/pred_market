import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";
import { getUser, type User } from "./users";

// Signed-in sessions are a signed JWT in an httpOnly cookie; there is no session table.
// SameSite=Lax keeps the cookie off cross-site POSTs, and mutating routes also check Origin.

export const SESSION_COOKIE = "op_session";
const SESSION_DAYS = 30;

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET must be set (32+ chars)");
  return new TextEncoder().encode(s);
}

export async function createSession(res: NextResponse, userId: string): Promise<void> {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret());
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
}

export function clearSession(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

async function userFromToken(token: string | undefined): Promise<User | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    return payload.sub ? await getUser(payload.sub) : null;
  } catch {
    return null;
  }
}

/** The signed-in user in a Server Component. */
export async function currentUser(): Promise<User | null> {
  return userFromToken((await cookies()).get(SESSION_COOKIE)?.value);
}

/** The signed-in user in a Route Handler. */
export function requestUser(req: NextRequest): Promise<User | null> {
  return userFromToken(req.cookies.get(SESSION_COOKIE)?.value);
}

/** Reject state-changing requests that didn't come from our own pages. */
export function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  return !!origin && origin === req.nextUrl.origin;
}
