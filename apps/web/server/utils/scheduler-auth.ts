import { timingSafeEqual } from "node:crypto";

import { env } from "../env";

// Scheduled jobs (the daily digest, the file clean-up) are started by GitHub
// Actions with the shared DIGEST_RUN_SECRET as a bearer token.
export function schedulerConfigured() {
  return Boolean(env.DIGEST_RUN_SECRET);
}

export function isScheduler(request: Request) {
  const secret = env.DIGEST_RUN_SECRET;
  const given = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!secret || given.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(secret));
}
