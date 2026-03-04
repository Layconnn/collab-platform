import type {
  ListNotificationsInput,
  MarkAllNotificationsReadInput,
  MarkNotificationReadInput,
} from "@repo/validators/notification";
import type { NotificationType } from "../../app/generated/prisma/client";

import { redisCache } from "../cache/redis";
import { prisma } from "../db/prisma";
import { AppError } from "../errors/app-error";
import {
  recordNotificationAudit,
  recordNotificationOperation,
} from "../observability/security-events";
import { enqueueNotificationJob } from "../queue/notification.queue";

type RequestContext = {
  requestId: string;
};

type NotificationResource = {
  workspaceId: string;
  discussionId: string | null;
  commentId: string | null;
};

type PaginatedResult<T> = {
  items: T[];
  nextCursor: string | null;
};

const NOTIFICATION_LIST_TTL_SECONDS = 30;
const MENTION_REGEX = /@([a-zA-Z0-9_.-]{2,50})/g;

function toPaginatedResult<T extends { id: string }>(
  rows: T[],
  take: number,
): PaginatedResult<T> {
  if (rows.length <= take) {
    return {
      items: rows,
      nextCursor: null,
    };
  }

  const items = rows.slice(0, take);
  return {
    items,
    nextCursor: items[items.length - 1]?.id ?? null,
  };
}

function normalizeMentionName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

function notificationFeedCacheKey(
  userId: string,
  unreadOnly: boolean,
  cursor: string | undefined,
  take: number,
): string {
  return `notification:feed:${userId}:${unreadOnly ? "unread" : "all"}:${cursor ?? "start"}:${take}`;
}

function notificationDedupeKey(params: {
  type: NotificationType;
  recipientUserId: string;
  workspaceId: string;
  discussionId: string | null;
  commentId: string | null;
}): string {
  return [
    "notification",
    params.type,
    params.recipientUserId,
    params.workspaceId,
    params.discussionId ?? "none",
    params.commentId ?? "none",
  ].join(":");
}

async function invalidateNotificationFeed(userId: string): Promise<void> {
  await redisCache.delByPattern(`notification:feed:${userId}:*`);
}

async function resolveMentionUserIds(
  workspaceId: string,
  actorUserId: string,
  text: string,
): Promise<Set<string>> {
  const matches = [...text.matchAll(MENTION_REGEX)].map((match) =>
    normalizeMentionName(match[1] ?? ""),
  );
  if (matches.length === 0) {
    return new Set<string>();
  }

  const mentions = new Set(matches.filter(Boolean));
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId },
    select: {
      userId: true,
      user: {
        select: {
          name: true,
        },
      },
    },
  });

  const resolved = new Set<string>();
  for (const member of members) {
    if (member.userId === actorUserId) {
      continue;
    }
    const normalized = normalizeMentionName(member.user.name ?? "");
    if (normalized && mentions.has(normalized)) {
      resolved.add(member.userId);
    }
  }
  return resolved;
}

async function getWorkspaceRecipients(
  workspaceId: string,
  actorUserId: string,
): Promise<string[]> {
  const members = await prisma.workspaceMember.findMany({
    where: {
      workspaceId,
      userId: {
        not: actorUserId,
      },
    },
    select: {
      userId: true,
    },
  });

  return members.map((m) => m.userId);
}

async function enqueueNotificationsForRecipients(params: {
  requestId: string;
  actorUserId: string;
  recipients: string[];
  mentions: Set<string>;
  resource: NotificationResource;
  genericType: NotificationType;
  genericMessage: string;
  mentionMessage: string;
  metadata: Record<string, string | number | boolean | null>;
}): Promise<void> {
  for (const recipientUserId of params.recipients) {
    const isMention = params.mentions.has(recipientUserId);
    const type: NotificationType = isMention ? "MENTION" : params.genericType;
    const message = isMention ? params.mentionMessage : params.genericMessage;

    const dedupeKey = notificationDedupeKey({
      type,
      recipientUserId,
      workspaceId: params.resource.workspaceId,
      discussionId: params.resource.discussionId,
      commentId: params.resource.commentId,
    });

    try {
      await enqueueNotificationJob({
        dedupeKey,
        recipientUserId,
        actorUserId: params.actorUserId,
        workspaceId: params.resource.workspaceId,
        discussionId: params.resource.discussionId,
        commentId: params.resource.commentId,
        type,
        message,
        metadata: params.metadata,
      });

      const timestamp = new Date().toISOString();
      await recordNotificationOperation({
        requestId: params.requestId,
        actorUserId: params.actorUserId,
        recipientUserId,
        workspaceId: params.resource.workspaceId,
        notificationId: null,
        action: "enqueue",
        timestamp,
      });
      await recordNotificationAudit({
        requestId: params.requestId,
        actorUserId: params.actorUserId,
        recipientUserId,
        workspaceId: params.resource.workspaceId,
        discussionId: params.resource.discussionId,
        commentId: params.resource.commentId,
        type,
        action: "enqueue",
        timestamp,
      });
    } catch (error) {
      await recordNotificationOperation({
        requestId: params.requestId,
        actorUserId: params.actorUserId,
        recipientUserId,
        workspaceId: params.resource.workspaceId,
        notificationId: null,
        action: "enqueue_failed",
        timestamp: new Date().toISOString(),
      });
      console.error(
        JSON.stringify({
          level: "ERROR",
          event: "notification.enqueue.failed",
          requestId: params.requestId,
          actorUserId: params.actorUserId,
          recipientUserId,
          workspaceId: params.resource.workspaceId,
          discussionId: params.resource.discussionId,
          commentId: params.resource.commentId,
          error: String(error),
          timestamp: new Date().toISOString(),
        }),
      );
    }
  }
}

export const notificationService = {
  async enqueueDiscussionCreated(params: {
    requestId: string;
    actorUserId: string;
    workspaceId: string;
    discussionId: string;
    title: string;
    body: string;
  }): Promise<void> {
    const recipients = await getWorkspaceRecipients(params.workspaceId, params.actorUserId);
    if (recipients.length === 0) {
      return;
    }

    const mentions = await resolveMentionUserIds(
      params.workspaceId,
      params.actorUserId,
      `${params.title} ${params.body}`,
    );

    await enqueueNotificationsForRecipients({
      requestId: params.requestId,
      actorUserId: params.actorUserId,
      recipients,
      mentions,
      resource: {
        workspaceId: params.workspaceId,
        discussionId: params.discussionId,
        commentId: null,
      },
      genericType: "DISCUSSION_CREATED",
      genericMessage: "New discussion created in your workspace.",
      mentionMessage: "You were mentioned in a discussion.",
      metadata: {
        discussionId: params.discussionId,
      },
    });
  },

  async enqueueCommentCreated(params: {
    requestId: string;
    actorUserId: string;
    workspaceId: string;
    discussionId: string;
    commentId: string;
    body: string;
    parentCommentId: string | null;
  }): Promise<void> {
    const recipients = await getWorkspaceRecipients(params.workspaceId, params.actorUserId);
    if (recipients.length === 0) {
      return;
    }

    const mentions = await resolveMentionUserIds(
      params.workspaceId,
      params.actorUserId,
      params.body,
    );

    await enqueueNotificationsForRecipients({
      requestId: params.requestId,
      actorUserId: params.actorUserId,
      recipients,
      mentions,
      resource: {
        workspaceId: params.workspaceId,
        discussionId: params.discussionId,
        commentId: params.commentId,
      },
      genericType: "COMMENT_CREATED",
      genericMessage: "New comment added in a discussion.",
      mentionMessage: "You were mentioned in a comment.",
      metadata: {
        discussionId: params.discussionId,
        commentId: params.commentId,
        parentCommentId: params.parentCommentId,
      },
    });
  },

  async listForUser(
    userId: string,
    input: ListNotificationsInput,
    context: RequestContext,
  ): Promise<
    PaginatedResult<{
      id: string;
      type: NotificationType;
      message: string;
      workspaceId: string;
      discussionId: string | null;
      commentId: string | null;
      readAt: Date | null;
      createdAt: Date;
      actor: { id: string; name: string | null } | null;
    }>
  > {
    const cacheKey = notificationFeedCacheKey(userId, input.unreadOnly, input.cursor, input.take);
    const cached = await redisCache.getJSON<
      PaginatedResult<{
        id: string;
        type: NotificationType;
        message: string;
        workspaceId: string;
        discussionId: string | null;
        commentId: string | null;
        readAt: Date | null;
        createdAt: Date;
        actor: { id: string; name: string | null } | null;
      }>
    >(cacheKey);
    if (cached) {
      return cached;
    }

    const rows = await prisma.notification.findMany({
      where: {
        recipientUserId: userId,
        workspace: {
          members: {
            some: {
              userId,
            },
          },
        },
        ...(input.unreadOnly ? { readAt: null } : {}),
      },
      take: input.take + 1,
      skip: input.cursor ? 1 : 0,
      cursor: input.cursor ? { id: input.cursor } : undefined,
      orderBy: { id: "desc" },
      select: {
        id: true,
        type: true,
        message: true,
        workspaceId: true,
        discussionId: true,
        commentId: true,
        readAt: true,
        createdAt: true,
        actor: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    const paginated = toPaginatedResult(rows, input.take);
    await redisCache.setJSON(cacheKey, paginated, NOTIFICATION_LIST_TTL_SECONDS);
    await recordNotificationOperation({
      requestId: context.requestId,
      actorUserId: userId,
      recipientUserId: userId,
      workspaceId: null,
      notificationId: null,
      action: "list",
      timestamp: new Date().toISOString(),
    });
    await recordNotificationAudit({
      requestId: context.requestId,
      actorUserId: userId,
      recipientUserId: userId,
      workspaceId: null,
      discussionId: null,
      commentId: null,
      type: null,
      action: "list",
      timestamp: new Date().toISOString(),
    });
    return paginated;
  },

  async markAsRead(
    userId: string,
    input: MarkNotificationReadInput,
    context: RequestContext,
  ): Promise<{ success: true }> {
    const now = new Date();
    const updated = await prisma.notification.updateMany({
      where: {
        id: input.notificationId,
        recipientUserId: userId,
      },
      data: {
        readAt: now,
      },
    });

    if (updated.count === 0) {
      throw new AppError("NOT_FOUND", "Notification not found.");
    }

    await invalidateNotificationFeed(userId);
    await recordNotificationOperation({
      requestId: context.requestId,
      actorUserId: userId,
      recipientUserId: userId,
      workspaceId: null,
      notificationId: input.notificationId,
      action: "mark_read",
      timestamp: new Date().toISOString(),
    });
    await recordNotificationAudit({
      requestId: context.requestId,
      actorUserId: userId,
      recipientUserId: userId,
      workspaceId: null,
      discussionId: null,
      commentId: null,
      type: null,
      action: "mark_read",
      timestamp: new Date().toISOString(),
    });

    return { success: true as const };
  },

  async markAllAsRead(
    userId: string,
    input: MarkAllNotificationsReadInput,
    context: RequestContext,
  ): Promise<{ updatedCount: number }> {
    const now = new Date();
    const updated = await prisma.notification.updateMany({
      where: {
        recipientUserId: userId,
        readAt: null,
        ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      },
      data: {
        readAt: now,
      },
    });

    await invalidateNotificationFeed(userId);
    await recordNotificationOperation({
      requestId: context.requestId,
      actorUserId: userId,
      recipientUserId: userId,
      workspaceId: input.workspaceId ?? null,
      notificationId: null,
      action: "mark_all_read",
      timestamp: new Date().toISOString(),
    });
    await recordNotificationAudit({
      requestId: context.requestId,
      actorUserId: userId,
      recipientUserId: userId,
      workspaceId: input.workspaceId ?? null,
      discussionId: null,
      commentId: null,
      type: null,
      action: "mark_all_read",
      timestamp: new Date().toISOString(),
    });

    return { updatedCount: updated.count };
  },
};
