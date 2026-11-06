import { NextRequest, NextResponse } from "next/server";
import { requestUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// The nav calls this to show "Sign in" or the account menu, so pages themselves stay static.
export async function GET(req: NextRequest) {
  const user = await requestUser(req);
  return NextResponse.json(
    { user: user ? { name: user.name, email: user.email, image: user.image } : null },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
