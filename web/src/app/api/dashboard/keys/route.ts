import { NextRequest, NextResponse } from "next/server";
import { requestUser, sameOrigin } from "@/lib/session";
import { createUserKey, revokeUserKey, listUserKeys, MAX_KEYS_PER_USER } from "@/lib/apikeys";

export const dynamic = "force-dynamic";

const cleanName = (n: unknown) => (typeof n === "string" ? n.trim().slice(0, 40) : "") || "Default key";

// POST { name }               — create a key (returned once)
// POST { rotate: id }         — replace a key with a new one under the same name
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const user = await requestUser(req);
  if (!user) return NextResponse.json({ error: "sign in required" }, { status: 401 });
  const body = await req.json().catch(() => ({}));

  if (typeof body.rotate === "string") {
    const existing = (await listUserKeys(user.id)).find((k) => k.id === body.rotate);
    if (!existing) return NextResponse.json({ error: "key not found" }, { status: 404 });
    await revokeUserKey(user.id, existing.id);
    const created = await createUserKey(user.id, existing.name);
    return NextResponse.json(created);
  }

  const created = await createUserKey(user.id, cleanName(body.name));
  if (!created) {
    return NextResponse.json({ error: `you can have up to ${MAX_KEYS_PER_USER} keys; revoke one first` }, { status: 409 });
  }
  return NextResponse.json(created);
}

// DELETE ?id=<key id> — revoke a key. It stops working within a minute.
export async function DELETE(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const user = await requestUser(req);
  if (!user) return NextResponse.json({ error: "sign in required" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!(await revokeUserKey(user.id, id))) return NextResponse.json({ error: "key not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
