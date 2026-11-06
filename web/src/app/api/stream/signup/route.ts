import { NextRequest, NextResponse } from "next/server";
import { createFreeKey } from "@/lib/apikeys";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// POST { email, accept_terms } — issue a free data stream key. The key is returned once.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json({ error: "enter a valid email" }, { status: 400 });
  }
  if (body?.accept_terms !== true) {
    return NextResponse.json({ error: "accept the Terms and Privacy Policy to continue" }, { status: 400 });
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";

  const result = await createFreeKey(email, ip);
  if ("key" in result) return NextResponse.json({ key: result.key });
  if (result.error === "email_taken") {
    return NextResponse.json(
      { error: "this email already has a key. Rotate it below if you still have it, or contact us." },
      { status: 409 }
    );
  }
  return NextResponse.json({ error: "too many signups from your network today, try again tomorrow" }, { status: 429 });
}
