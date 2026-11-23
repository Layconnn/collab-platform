import { handleCallback } from "@vercel/queue";

import { processNotificationJob } from "../../../../server/queue/notification.processor";
import type {
  NotificationJobData,
  NotificationQueueMessage,
} from "../../../../server/queue/notification.queue";
import { notificationBacklog } from "../../../../server/queue/notification.backlog";
import { captureError, initSentry } from "../../../../server/observability/sentry";

initSentry();

const MAX_DELIVERIES = 6;

// Vercel Queues consumer for the "notification-delivery" topic, registered in
// vercel.json. Only Vercel's queue infrastructure can invoke it. Returning
// acknowledges the message; throwing schedules a retry with backoff.
const handleNotificationMessage = handleCallback<NotificationQueueMessage | NotificationJobData>(
  async (message, metadata) => {
    const jobId = "jobId" in message ? message.jobId : undefined;
    try {
      // Messages published before the fan-out change carry a bare delivery payload.
      if ("name" in message && "payload" in message) {
        await processNotificationJob(message.name, message.payload);
      } else {
        await processNotificationJob("deliver", message);
      }
    } catch (error) {
      // The retry handler below acknowledges the final attempt; stop tracking it then.
      if (jobId && metadata.deliveryCount >= MAX_DELIVERIES) await notificationBacklog.markSettled(jobId);
      throw error;
    }
    if (jobId) await notificationBacklog.markSettled(jobId);
    console.info(
      JSON.stringify({
        level: "INFO",
        event: "notification.queue.delivered",
        messageId: metadata.messageId,
        deliveryCount: metadata.deliveryCount,
        waitedMs: Date.now() - new Date(metadata.createdAt).getTime(),
        timestamp: new Date().toISOString(),
      }),
    );
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
