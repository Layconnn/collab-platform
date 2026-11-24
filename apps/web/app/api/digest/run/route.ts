import { timingSafeEqual } from "node:crypto";

import { env } from "../../../../server/env";
import { configuredSender } from "../../../../server/services/email/email";
import { runDigest } from "../../../../server/services/digest/digest.runner";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Starts (or continues) today's digest run. Called by
// .github/workflows/daily-digest.yml with the shared DIGEST_RUN_SECRET; it
// answers done: false until a call finds nobody left (daily digest PRD).
const TIME_BUDGET_MS = 45_000;

function authorized(request: Request) {
  const secret = env.DIGEST_RUN_SECRET;
  const given = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!secret || given.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(secret));
}

export async function POST(request: Request): Promise<Response> {
  const headers = { "cache-control": "no-store" };
  if (!env.DIGEST_RUN_SECRET) return Response.json({ status: "not configured" }, { status: 503, headers });
  if (!authorized(request)) return Response.json({ status: "unauthorized" }, { status: 401, headers });
  const result = await runDigest({
    sender: configuredSender(),
    delivery: env.DIGEST_DELIVERY,
    allowlist: (env.DIGEST_ALLOWLIST ?? "").split(","),
    deadline: Date.now() + TIME_BUDGET_MS,
    pauseMs: 550,
  });
  return Response.json({ status: "ok", ...result }, { headers });
}
