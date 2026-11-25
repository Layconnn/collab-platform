import { env } from "../../../../server/env";
import { configuredSender } from "../../../../server/services/email/email";
import { runDigest } from "../../../../server/services/digest/digest.runner";
import { isScheduler, schedulerConfigured } from "../../../../server/utils/scheduler-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Starts (or continues) today's digest run. Called by
// .github/workflows/daily-digest.yml with the shared DIGEST_RUN_SECRET; it
// answers done: false until a call finds nobody left (daily digest PRD).
const TIME_BUDGET_MS = 45_000;

export async function POST(request: Request): Promise<Response> {
  const headers = { "cache-control": "no-store" };
  if (!schedulerConfigured()) return Response.json({ status: "not configured" }, { status: 503, headers });
  if (!isScheduler(request)) return Response.json({ status: "unauthorized" }, { status: 401, headers });
  const result = await runDigest({
    sender: configuredSender(),
    delivery: env.DIGEST_DELIVERY,
    allowlist: (env.DIGEST_ALLOWLIST ?? "").split(","),
    deadline: Date.now() + TIME_BUDGET_MS,
    pauseMs: 550,
  });
  return Response.json({ status: "ok", ...result }, { headers });
}
