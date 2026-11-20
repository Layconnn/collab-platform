import { AppError } from "../errors/app-error";
import {
  recordNotificationAudit,
  recordNotificationOperation,
} from "../observability/security-events";
import { prisma } from "../db/prisma";
import {
  planNotificationDeliveries,
  type NotificationEvent,
} from "../services/notification.service";
import type {
  NotificationJobData,
  NotificationJobName,
  NotificationQueuePayload,
} from "./notification.queue";

// Persists one notification job. Shared by the BullMQ worker and the Vercel Queue
// consumer; both may deliver a job more than once, so the write is an upsert on
// the job's dedupe key and a repeat delivery changes nothing.
export async function deliverNotification(payload: NotificationJobData): Promise<void> {
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
}

// Expands one event into notifications for the current workspace members and
// writes them in a single statement. The dedupe key is unique, so a retried
// job skips rows it already wrote instead of failing or duplicating them.
export async function deliverFanout(event: NotificationEvent): Promise<number> {
  const deliveries = await planNotificationDeliveries(event);
  if (deliveries.length === 0) return 0;

  const result = await prisma.notification.createMany({
    data: deliveries.map((delivery) => ({
      dedupeKey: delivery.dedupeKey,
      recipientUserId: delivery.recipientUserId,
      actorUserId: delivery.actorUserId,
      workspaceId: delivery.workspaceId,
      discussionId: delivery.discussionId,
      commentId: delivery.commentId,
      type: delivery.type,
      message: delivery.message,
      metadata: delivery.metadata ?? undefined,
    })),
    skipDuplicates: true,
  });

  const timestamp = new Date().toISOString();
  for (const delivery of deliveries) {
    await recordNotificationAudit({
      requestId: event.requestId,
      actorUserId: delivery.actorUserId,
      recipientUserId: delivery.recipientUserId,
      workspaceId: delivery.workspaceId,
      discussionId: delivery.discussionId,
      commentId: delivery.commentId,
      type: delivery.type,
      action: "deliver",
      timestamp,
    });
  }
  return result.count;
}

// Entry point for both queue drivers. "deliver" jobs come from before fan-out
// moved to the consumer and may still be in flight; they keep working.
export async function processNotificationJob(name: NotificationJobName | string, payload: NotificationQueuePayload): Promise<void> {
  if (name === "fanout") {
    await deliverFanout(payload as NotificationEvent);
    return;
  }
  await deliverNotification(payload as NotificationJobData);
}
