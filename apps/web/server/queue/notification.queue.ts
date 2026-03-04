import type { NotificationType } from "../../app/generated/prisma/client";

import { createQueue } from "./bullmq";

export const NOTIFICATION_QUEUE_NAME = "notification-delivery";

export type NotificationJobData = {
  dedupeKey: string;
  recipientUserId: string;
  actorUserId: string | null;
  workspaceId: string;
  discussionId: string | null;
  commentId: string | null;
  type: NotificationType;
  message: string;
  metadata: Record<string, string | number | boolean | null> | null;
};

export const notificationQueue = createQueue<NotificationJobData>(NOTIFICATION_QUEUE_NAME);

export async function enqueueNotificationJob(payload: NotificationJobData): Promise<void> {
  await notificationQueue.add("deliver", payload, {
    jobId: payload.dedupeKey,
  });
}
