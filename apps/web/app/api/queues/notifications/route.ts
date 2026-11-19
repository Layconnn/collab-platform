import { handleCallback } from "@vercel/queue";

import { deliverNotification } from "../../../../server/queue/notification.processor";
import type { NotificationJobData } from "../../../../server/queue/notification.queue";
import { captureError, initSentry } from "../../../../server/observability/sentry";

initSentry();

const MAX_DELIVERIES = 6;

// Vercel Queues consumer for the "notification-delivery" topic, registered in
// vercel.json. Only Vercel's queue infrastructure can invoke it. Returning
// acknowledges the message; throwing schedules a retry with backoff.
const handleNotificationMessage = handleCallback<NotificationJobData>(
  async (payload) => {
    await deliverNotification(payload);
  },
  {
    retry: (error, metadata) => {
      captureError(error, {
        queue: metadata.topicName,
        messageId: metadata.messageId,
        deliveryCount: metadata.deliveryCount,
      });
      console.error(
        JSON.stringify({
          level: "ERROR",
          event: "notification.queue.delivery_failed",
          messageId: metadata.messageId,
          deliveryCount: metadata.deliveryCount,
          error: String(error),
          timestamp: new Date().toISOString(),
        }),
      );
      if (metadata.deliveryCount >= MAX_DELIVERIES) {
        // Stop retrying a message that keeps failing; the log above records it.
        return { acknowledge: true };
      }
      return { afterSeconds: Math.min(300, 2 ** metadata.deliveryCount * 5) };
    },
  },
);

// Next.js route handlers must take a Request; the SDK handler also accepts other shapes.
export async function POST(request: Request): Promise<Response> {
  return handleNotificationMessage(request);
}
