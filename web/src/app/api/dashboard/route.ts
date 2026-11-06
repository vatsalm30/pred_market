import { NextRequest, NextResponse } from "next/server";
import { requestUser } from "@/lib/session";
import { listUserKeys, userLabel } from "@/lib/apikeys";
import { getLive, getUsage } from "@/lib/usage";
import { userProviders } from "@/lib/users";
import { FREE_LIMITS } from "@/lib/streamLimits";

export const dynamic = "force-dynamic";

// Everything the dashboard shows for the signed-in account.
export async function GET(req: NextRequest) {
  const user = await requestUser(req);
  if (!user) return NextResponse.json({ error: "sign in required" }, { status: 401 });
  const label = userLabel(user.id);
  const [keys, usage, live] = await Promise.all([listUserKeys(user.id), getUsage(label, 14), getLive(label)]);
  return NextResponse.json(
    {
      user: { name: user.name, email: user.email, image: user.image, created: user.created, providers: userProviders(user) },
      tier: "free",
      limits: FREE_LIMITS,
      keys,
      usage,
      live,
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
