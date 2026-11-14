import type { NextRequest } from "next/server";

/** True when the request carries the stream service's shared secret. */
export function fromStream(req: NextRequest): boolean {
  const secret = process.env.STREAM_VERIFY_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}
