import { attachmentService } from "../../../../server/services/files/attachment.service";
import { configuredStorage } from "../../../../server/services/files/storage";
import { isScheduler, schedulerConfigured } from "../../../../server/utils/scheduler-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Deletes expired uploads and removed files from storage (file uploads PRD,
// FR-12). Called daily by .github/workflows/files-cleanup.yml until done.
const TIME_BUDGET_MS = 45_000;

export async function POST(request: Request): Promise<Response> {
  const headers = { "cache-control": "no-store" };
  const storage = configuredStorage();
  if (!schedulerConfigured() || !storage) return Response.json({ status: "not configured" }, { status: 503, headers });
  if (!isScheduler(request)) return Response.json({ status: "unauthorized" }, { status: 401, headers });
  const result = await attachmentService.cleanup({ storage, deadline: Date.now() + TIME_BUDGET_MS });
  return Response.json({ status: "ok", ...result }, { headers });
}
