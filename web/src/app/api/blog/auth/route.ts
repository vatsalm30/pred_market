import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const pw = req.headers.get("x-admin-password");
  if (!process.env.ADMIN_PASSWORD || pw !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ ok: true });
}
