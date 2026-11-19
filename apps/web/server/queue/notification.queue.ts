import { createHash } from "node:crypto";
import type { Queue } from "bullmq";
import type { NotificationType } from "../../app/generated/prisma/client";

import { env } from "../env";

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

type NotificationQueueDriver = "vercel" | "bullmq";

// On Vercel, jobs go to Vercel Queues and the consumer route in
// app/api/queues/notifications delivers them; Vercel cannot host a long-lived
// BullMQ worker. Everywhere else (local development, a Railway or Docker worker)
// jobs go to BullMQ. NOTIFICATION_QUEUE_DRIVER overrides the choice.
export function resolveNotificationQueueDriver(): NotificationQueueDriver {
  if (env.NOTIFICATION_QUEUE_DRIVER) {
    return env.NOTIFICATION_QUEUE_DRIVER;
  }
  return process.env.VERCEL ? "vercel" : "bullmq";
}

let bullQueue: Queue<NotificationJobData> | null = null;

// Created on first use so builds and Vercel functions never open a BullMQ connection.
async function getBullQueue(): Promise<Queue<NotificationJobData>> {
  if (!bullQueue) {
    const { createQueue } = await import("./bullmq");
    bullQueue = createQueue<NotificationJobData>(NOTIFICATION_QUEUE_NAME);
  }
  return bullQueue;
}

export const notificationQueue = {
  async add(name: string, payload: NotificationJobData, options: { jobId: string }): Promise<void> {
    if (resolveNotificationQueueDriver() === "vercel") {
      const { send } = await import("@vercel/queue");
      // The same job id makes a repeated enqueue deliver only once.
      await send(NOTIFICATION_QUEUE_NAME, payload, { idempotencyKey: options.jobId });
      return;
    }

    const queue = await getBullQueue();
    await queue.add(name, payload, options);
  },

  async close(): Promise<void> {
    if (bullQueue) {
      await bullQueue.close();
      bullQueue = null;
    }
  },
};

export async function enqueueNotificationJob(payload: NotificationJobData): Promise<void> {
  await notificationQueue.add("deliver", payload, {
    jobId: createHash("sha256").update(payload.dedupeKey).digest("hex"),
  });
}
