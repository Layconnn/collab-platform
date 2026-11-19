import { captureError } from "../../observability/sentry";
import { createWorker } from "../bullmq";
import {
  NOTIFICATION_QUEUE_NAME,
  type NotificationJobData,
} from "../notification.queue";
import { deliverNotification } from "../notification.processor";

export const notificationWorker = createWorker<NotificationJobData>(
  NOTIFICATION_QUEUE_NAME,
  async (job) => deliverNotification(job.data),
);

notificationWorker.on("completed", (job) => {
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
