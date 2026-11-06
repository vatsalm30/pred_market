import crypto from "node:crypto";
import { DeleteCommand, GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { db, TABLE } from "./db";

// Accounts created by signing in with Google or GitHub. Items:
//   user / <userId>                          email, name, image, created, login_<provider>
//   userlogin#<provider> / <providerUserId>  userId (which account a login belongs to)
//   useremail / <email>                      userId (links providers that share a verified email)

export const PROVIDERS = ["google", "github"] as const;
export type Provider = (typeof PROVIDERS)[number];

export interface User {
  id: string;
  email: string;
  name: string;
  image: string | null;
  created: string;
  login_google?: string;
  login_github?: string;
}

export interface ProviderProfile {
  provider: Provider;
  providerUserId: string;
  email: string; // must be verified by the provider
  name: string;
  image: string | null;
}

export const userProviders = (u: User): Provider[] => PROVIDERS.filter((p) => u[`login_${p}`]);

export async function getUser(id: string): Promise<User | null> {
  const res = await db().send(new GetCommand({ TableName: TABLE, Key: { pk: "user", sk: id } }));
  return (res.Item as User | undefined) ?? null;
}

async function lookup(pk: string, sk: string): Promise<string | null> {
  const res = await db().send(new GetCommand({ TableName: TABLE, Key: { pk, sk } }));
  return (res.Item?.userId as string | undefined) ?? null;
}

/**
 * Find the account for a provider login, linking it to an existing account with the
 * same verified email, or create a new one.
 */
export async function upsertUser(p: ProviderProfile): Promise<User> {
  const email = p.email.toLowerCase();
  let userId = (await lookup(`userlogin#${p.provider}`, p.providerUserId)) ?? (await lookup("useremail", email));

  if (!userId) {
    userId = crypto.randomUUID();
    try {
      await db().send(
        new PutCommand({
          TableName: TABLE,
          Item: { pk: "useremail", sk: email, userId },
          ConditionExpression: "attribute_not_exists(pk)",
        })
      );
    } catch (e) {
      // Two first logins raced; use the account the other one created.
      if ((e as Error).name !== "ConditionalCheckFailedException") throw e;
      userId = (await lookup("useremail", email))!;
    }
  }

  await db().send(
    new PutCommand({ TableName: TABLE, Item: { pk: `userlogin#${p.provider}`, sk: p.providerUserId, userId } })
  );
  const res = await db().send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { pk: "user", sk: userId },
      UpdateExpression:
        "SET id = :id, email = if_not_exists(email, :email), #n = :name, image = :image, " +
        "created = if_not_exists(created, :now), #login = :pid",
      ExpressionAttributeNames: { "#n": "name", "#login": `login_${p.provider}` },
      ExpressionAttributeValues: {
        ":id": userId,
        ":email": email,
        ":name": p.name || email,
        ":image": p.image,
        ":now": new Date().toISOString(),
        ":pid": p.providerUserId,
      },
      ReturnValues: "ALL_NEW",
    })
  );
  return res.Attributes as User;
}

/** Remove an account and its login links. Keys and usage are removed by the caller. */
export async function deleteUser(user: User): Promise<void> {
  const keys = [
    ...userProviders(user).map((p) => ({ pk: `userlogin#${p}`, sk: user[`login_${p}`]! })),
    { pk: "useremail", sk: user.email },
    { pk: "user", sk: user.id },
  ];
  for (const Key of keys) await db().send(new DeleteCommand({ TableName: TABLE, Key }));
}
