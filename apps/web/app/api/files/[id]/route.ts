import { TRPCError } from "@trpc/server";

import { AppError } from "../../../../server/errors/app-error";
import { resolveAuthenticatedUser, resolveRequestId } from "../../../../server/middleware/auth";
import { createRateLimitGuard } from "../../../../server/middleware/rateLimit";
import { attachmentService } from "../../../../server/services/files/attachment.service";

export const dynamic = "force-dynamic";

// Opens an attachment (file uploads PRD, FR-8): checks the signed-in member may
// read its post, then redirects to a download URL that expires in 5 minutes.
// Links to this route can be shared inside Commons; they only work for members.
const downloadRateLimit = createRateLimitGuard({ routeKey: "files.download", limit: 300, windowSeconds: 60 });

const plain = (status: number, text: string) =>
  new Response(text, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" } });

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const user = await resolveAuthenticatedUser(request.headers);
  if (!user) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", `/api/files/${encodeURIComponent(id)}`);
    return Response.redirect(login, 303);
  }
  try {
    await downloadRateLimit(user.id, resolveRequestId(request.headers));
    const url = await attachmentService.downloadUrl(user.id, id, { download: new URL(request.url).searchParams.get("download") === "1" });
    return new Response(null, { status: 302, headers: { location: url, "cache-control": "no-store", "referrer-policy": "no-referrer" } });
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") return plain(404, "This file does not exist, or you no longer have access to it.");
    if (error instanceof AppError && error.code === "BAD_REQUEST") return plain(503, "Files are not available right now.");
    if (error instanceof TRPCError && error.code === "TOO_MANY_REQUESTS") return plain(429, "Too many downloads. Try again in a minute.");
    throw error;
  }
}
