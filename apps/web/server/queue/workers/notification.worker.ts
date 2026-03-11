import { AppError } from "../../errors/app-error";
import {
  recordNotificationAudit,
  recordNotificationOperation,
} from "../../observability/security-events";
import { captureError } from "../../observability/sentry";
import { createWorker } from "../bullmq";
import {
  NOTIFICATION_QUEUE_NAME,
  type NotificationJobData,
} from "../notification.queue";
import { prisma } from "../../db/prisma";

export const notificationWorker = createWorker<NotificationJobData>(
  NOTIFICATION_QUEUE_NAME,
  async (job) => {
    const payload = job.data;
    const timestamp = new Date().toISOString();

    const membership = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: payload.workspaceId,
          userId: payload.recipientUserId,
        },
      },
      select: {
        userId: true,
      },
    });

    if (!membership) {
      await recordNotificationOperation({
        requestId: payload.dedupeKey,
        actorUserId: payload.actorUserId,
        recipientUserId: payload.recipientUserId,
        workspaceId: payload.workspaceId,
        notificationId: null,
        action: "drop_non_member",
        timestamp,
      });
      return;
    }

    const notification = await prisma.notification.upsert({
      where: { dedupeKey: payload.dedupeKey },
      update: {},
      create: {
        dedupeKey: payload.dedupeKey,
        recipientUserId: payload.recipientUserId,
        actorUserId: payload.actorUserId,
        workspaceId: payload.workspaceId,
        discussionId: payload.discussionId,
        commentId: payload.commentId,
        type: payload.type,
        message: payload.message,
        metadata: payload.metadata ?? undefined,
      },
      select: {
        id: true,
      },
    });

    if (!notification?.id) {
      throw new AppError("INTERNAL", "Failed to persist notification.");
    }

    await recordNotificationOperation({
      requestId: payload.dedupeKey,
      actorUserId: payload.actorUserId,
      recipientUserId: payload.recipientUserId,
      workspaceId: payload.workspaceId,
      notificationId: notification.id,
      action: "deliver",
      timestamp,
    });
    await recordNotificationAudit({
      requestId: payload.dedupeKey,
      actorUserId: payload.actorUserId,
      recipientUserId: payload.recipientUserId,
      workspaceId: payload.workspaceId,
      discussionId: payload.discussionId,
      commentId: payload.commentId,
      type: payload.type,
      action: "deliver",
      timestamp,
    });
  },
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
