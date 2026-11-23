import { notificationBacklog } from "../../../../server/queue/notification.backlog";

export const dynamic = "force-dynamic";

// Public, data-free health check for notification delivery. 200 when the
// oldest undelivered job is recent, 503 when it is delayed or Redis is down.
// Checked every 15 minutes by .github/workflows/notification-health.yml.
export async function GET(): Promise<Response> {
  const headers = { "cache-control": "no-store" };
  try {
    const backlog = await notificationBacklog.read();
    return Response.json(backlog, { status: backlog.status === "ok" ? 200 : 503, headers });
  } catch {
    return Response.json({ status: "unknown" }, { status: 503, headers });
  }
}
