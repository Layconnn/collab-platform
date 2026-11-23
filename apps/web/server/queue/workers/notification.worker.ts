import { captureError } from "../../observability/sentry";
import { createWorker } from "../bullmq";
import {
  NOTIFICATION_QUEUE_NAME,
  type NotificationQueuePayload,
} from "../notification.queue";
import { notificationBacklog } from "../notification.backlog";
import { processNotificationJob } from "../notification.processor";

export const notificationWorker = createWorker<NotificationQueuePayload>(
  NOTIFICATION_QUEUE_NAME,
  async (job) => processNotificationJob(job.name, job.data),
);

notificationWorker.on("completed", (job) => {
  if (job.id) void notificationBacklog.markSettled(job.id);
  console.info(
    JSON.stringify({
      level: "INFO",
      event: "notification.worker.completed",
      jobId: job.id,
      timestamp: new Date().toISOString(),
    }),
  );
});

notificationWorker.on("failed", (job, error) => {
  // Stop tracking once BullMQ has used every attempt; earlier failures retry.
  if (job?.id && job.attemptsMade >= (job.opts.attempts ?? 1)) void notificationBacklog.markSettled(job.id);
  captureError(error, { jobId: job?.id, queue: NOTIFICATION_QUEUE_NAME });
  console.error(
    JSON.stringify({
      level: "ERROR",
      event: "notification.worker.failed",
      jobId: job?.id ?? null,
      error: String(error),
      timestamp: new Date().toISOString(),
    }),
  );
});

notificationWorker.on("error", (error) => {
  captureError(error, { queue: NOTIFICATION_QUEUE_NAME });
  console.error(
    JSON.stringify({
      level: "ERROR",
      event: "notification.worker.error",
      error: String(error),
      timestamp: new Date().toISOString(),
    }),
  );
});
