import { NextRequest, NextResponse } from "next/server";
import { clearSession, sameOrigin } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const res = NextResponse.json({ ok: true });
  clearSession(res);
  return res;
}
