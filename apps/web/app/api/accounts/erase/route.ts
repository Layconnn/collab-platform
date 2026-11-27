import { accountService } from "../../../../server/services/account.service";
import { configuredStorage } from "../../../../server/services/files/storage";
import { isScheduler, schedulerConfigured } from "../../../../server/utils/scheduler-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Erases accounts closed more than 30 days ago (settings PRD, FR-19). Called
// daily by .github/workflows/account-erasure.yml until done.
const TIME_BUDGET_MS = 45_000;

export async function POST(request: Request): Promise<Response> {
  const headers = { "cache-control": "no-store" };
  if (!schedulerConfigured()) return Response.json({ status: "not configured" }, { status: 503, headers });
  if (!isScheduler(request)) return Response.json({ status: "unauthorized" }, { status: 401, headers });
  const result = await accountService.eraseClosedAccounts({ storage: configuredStorage(), deadline: Date.now() + TIME_BUDGET_MS });
  return Response.json({ status: "ok", ...result }, { headers });
}
