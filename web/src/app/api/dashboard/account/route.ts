import { NextRequest, NextResponse } from "next/server";
import { DeleteCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { db, TABLE } from "@/lib/db";
import { clearSession, requestUser, sameOrigin } from "@/lib/session";
import { listUserKeys, revokeUserKey, userLabel } from "@/lib/apikeys";
import { deleteUser } from "@/lib/users";

export const dynamic = "force-dynamic";

// DELETE — delete the account: revoke its keys, erase usage history and the account itself.
export async function DELETE(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const user = await requestUser(req);
  if (!user) return NextResponse.json({ error: "sign in required" }, { status: 401 });

  for (const k of await listUserKeys(user.id)) await revokeUserKey(user.id, k.id);

  const label = userLabel(user.id);
  const usage = await db().send(
    new QueryCommand({ TableName: TABLE, KeyConditionExpression: "pk = :pk", ExpressionAttributeValues: { ":pk": `usage#${label}` } })
  );
  for (const i of usage.Items ?? []) {
    await db().send(new DeleteCommand({ TableName: TABLE, Key: { pk: i.pk, sk: i.sk } }));
  }
  await db().send(new DeleteCommand({ TableName: TABLE, Key: { pk: "live", sk: label } }));
  await deleteUser(user);

  const res = NextResponse.json({ ok: true });
  clearSession(res);
  return res;
}
