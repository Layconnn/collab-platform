import { randomUUID } from "node:crypto";
import type {
  ListNotificationsInput,
  MarkAllNotificationsReadInput,
  MarkNotificationReadInput,
} from "@repo/validators/notification";
import type { NotificationType, Prisma } from "../../app/generated/prisma/client";

import { prisma } from "../db/prisma";
import { AppError } from "../errors/app-error";
import {
  recordNotificationAudit,
  recordNotificationOperation,
} from "../observability/security-events";
import { enqueueNotificationFanout, type NotificationJobData } from "../queue/notification.queue";
import { discussionFollowerIds } from "./follow.service";
import { extractMentions, normalizeUsername } from "../utils/mentions";
import { toPaginatedResult, type PaginatedResult } from "../../src/common/utils/pagination";

type RequestContext = {
  requestId: string;
};

type NotificationResource = {
  workspaceId: string;
  discussionId: string | null;
  commentId: string | null;
};

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

async function resolveMentionUserIds(
  workspaceId: string,
  actorUserId: string,
  text: string,
): Promise<Set<string>> {
  const mentions = extractMentions(text);
  if (mentions.length === 0) {
    return new Set<string>();
  }

  const mentionSet = new Set(mentions);
  const members = await prisma.workspaceMember.findMany({
    where: {
      workspaceId,
      user: {
        username: {
          in: mentions,
        },
      },
    },
    select: {
      userId: true,
      user: {
        select: {
          username: true,
        },
      },
    },
  });

  const resolved = new Set<string>();
  for (const member of members) {
    if (member.userId === actorUserId) {
      continue;
    }
    const normalized = normalizeUsername(member.user.username ?? "");
    if (normalized && mentionSet.has(normalized)) {
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

type Metadata = Record<string, string | number | boolean | null>;

// A notification-worthy event. The request publishes one of these; the queue
// consumer expands it into one notification per recipient, so a write never
// waits on the size of the workspace.
export type NotificationEvent =
  | {
      kind: "discussion_created";
      requestId: string;
      actorUserId: string;
      workspaceId: string;
      discussionId: string;
      title: string;
      body: string;
    }
  | {
      kind: "comment_created";
      requestId: string;
      actorUserId: string;
      workspaceId: string;
      discussionId: string;
      commentId: string;
      body: string;
      parentCommentId: string | null;
    }
  | {
      // Decision reviews (decision reviews PRD, FR-13): reviewers when asked or
      // asked again, the author when someone answers.
      kind: "decision_review";
      requestId: string;
      actorUserId: string;
      workspaceId: string;
      decisionId: string;
      question: string;
      type: "REVIEW_REQUESTED" | "REVIEW_RESPONDED";
      recipientUserIds: string[];
      message: string;
      occurredAt: string;
    }
  | {
      kind: "mentions_added";
      requestId: string;
      actorUserId: string;
      resource: NotificationResource;
      previousText: string;
      updatedText: string;
      updatedAt: string;
    };

function buildDeliveries(params: {
  actorUserId: string;
  recipients: string[];
  mentions: Set<string>;
  resource: NotificationResource;
  genericType: NotificationType;
  genericMessage: string;
  mentionMessage: string;
  metadata: Metadata;
  dedupeSuffix?: string;
}): NotificationJobData[] {
  return params.recipients.map((recipientUserId) => {
    const isMention = params.mentions.has(recipientUserId);
    const type: NotificationType = isMention ? "MENTION" : params.genericType;
    const baseDedupeKey = notificationDedupeKey({
      type,
      recipientUserId,
      workspaceId: params.resource.workspaceId,
      discussionId: params.resource.discussionId,
      commentId: params.resource.commentId,
    });
    return {
      dedupeKey: params.dedupeSuffix ? `${baseDedupeKey}:${params.dedupeSuffix}` : baseDedupeKey,
      recipientUserId,
      actorUserId: params.actorUserId,
      workspaceId: params.resource.workspaceId,
      discussionId: params.resource.discussionId,
      commentId: params.resource.commentId,
      type,
      message: isMention ? params.mentionMessage : params.genericMessage,
      metadata: params.metadata,
    };
  });
}

// Resolves recipients against current membership. Runs in the queue consumer
// (and in tests); it only reads, so a retried job plans the same deliveries.
export async function planNotificationDeliveries(event: NotificationEvent): Promise<NotificationJobData[]> {
  if (event.kind === "decision_review") {
    // Only people who are still members, never the person who acted.
    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId: event.workspaceId, userId: { in: event.recipientUserIds.filter((id) => id !== event.actorUserId) } },
      select: { userId: true },
    });
    return members.map(({ userId }) => ({
      dedupeKey: ["notification", event.type, userId, event.workspaceId, "decision", event.decisionId, event.occurredAt].join(":"),
      recipientUserId: userId,
      actorUserId: event.actorUserId,
      workspaceId: event.workspaceId,
      discussionId: null,
      commentId: null,
      type: event.type,
      message: event.message,
      metadata: { decisionId: event.decisionId, question: event.question },
    }));
  }
  if (event.kind === "mentions_added") {
    const [previous, updated] = await Promise.all([
      resolveMentionUserIds(event.resource.workspaceId, event.actorUserId, event.previousText),
      resolveMentionUserIds(event.resource.workspaceId, event.actorUserId, event.updatedText),
    ]);
    const added = [...updated].filter((userId) => !previous.has(userId));
    if (added.length === 0) return [];

    const message = event.resource.commentId
      ? "You were mentioned in a comment."
      : "You were mentioned in a discussion.";
    return buildDeliveries({
      actorUserId: event.actorUserId,
      recipients: added,
      mentions: new Set(added),
      resource: event.resource,
      genericType: "MENTION",
      genericMessage: message,
      mentionMessage: message,
      metadata: {
        discussionId: event.resource.discussionId,
        commentId: event.resource.commentId,
      },
      dedupeSuffix: `edit:${event.updatedAt}`,
    });
  }

  const recipients = await getWorkspaceRecipients(event.workspaceId, event.actorUserId);
  if (recipients.length === 0) return [];

  if (event.kind === "discussion_created") {
    const mentions = await resolveMentionUserIds(event.workspaceId, event.actorUserId, `${event.title} ${event.body}`);
    return buildDeliveries({
      actorUserId: event.actorUserId,
      recipients,
      mentions,
      resource: { workspaceId: event.workspaceId, discussionId: event.discussionId, commentId: null },
      genericType: "DISCUSSION_CREATED",
      genericMessage: "New discussion created in your workspace.",
      mentionMessage: "You were mentioned in a discussion.",
      metadata: { discussionId: event.discussionId },
    });
  }

  // Replies go to the discussion's followers and to anyone mentioned; members
  // who muted the discussion hear only when mentioned (FR-10, FR-11).
  const [mentions, followers] = await Promise.all([
    resolveMentionUserIds(event.workspaceId, event.actorUserId, event.body),
    discussionFollowerIds(event.workspaceId, event.discussionId),
  ]);
  return buildDeliveries({
    actorUserId: event.actorUserId,
    recipients: recipients.filter((userId) => followers.has(userId) || mentions.has(userId)),
    mentions,
    resource: { workspaceId: event.workspaceId, discussionId: event.discussionId, commentId: event.commentId },
    genericType: "COMMENT_CREATED",
    genericMessage: "New comment added in a discussion.",
    mentionMessage: "You were mentioned in a comment.",
    metadata: {
      discussionId: event.discussionId,
      commentId: event.commentId,
      parentCommentId: event.parentCommentId,
    },
  });
}

// Publishing is best effort: the user's write already succeeded, so a failed
// publish is logged instead of failing the request.
async function publishEvent(event: NotificationEvent, resource: NotificationResource): Promise<void> {
  const timestamp = new Date().toISOString();
  try {
    await enqueueNotificationFanout(event);
    await recordNotificationOperation({
      requestId: event.requestId,
      actorUserId: event.actorUserId,
      recipientUserId: null,
      workspaceId: resource.workspaceId,
      notificationId: null,
      action: "enqueue",
      timestamp,
    });
  } catch (error) {
    await recordNotificationOperation({
      requestId: event.requestId,
      actorUserId: event.actorUserId,
      recipientUserId: null,
      workspaceId: resource.workspaceId,
      notificationId: null,
      action: "enqueue_failed",
      timestamp,
    });
    console.error(
      JSON.stringify({
        level: "ERROR",
        event: "notification.enqueue.failed",
        requestId: event.requestId,
        actorUserId: event.actorUserId,
        kind: event.kind,
        workspaceId: resource.workspaceId,
        discussionId: resource.discussionId,
        commentId: resource.commentId,
        error: String(error),
        timestamp,
      }),
    );
  }
}

export const notificationService = {
  async enqueueDecisionReview(params: Omit<Extract<NotificationEvent, { kind: "decision_review" }>, "kind" | "occurredAt" | "requestId"> & { requestId?: string }): Promise<void> {
    if (!params.recipientUserIds.length) return;
    await publishEvent(
      { kind: "decision_review", ...params, requestId: params.requestId ?? randomUUID(), occurredAt: new Date().toISOString() },
      { workspaceId: params.workspaceId, discussionId: null, commentId: null },
    );
  },

  async enqueueNewMentionsFromEdit(params: {
    requestId: string;
    actorUserId: string;
    resource: NotificationResource;
    previousText: string;
    updatedText: string;
    updatedAt: Date;
  }): Promise<void> {
    if (params.previousText === params.updatedText) return;
    await publishEvent(
      {
        kind: "mentions_added",
        requestId: params.requestId,
        actorUserId: params.actorUserId,
        resource: params.resource,
        previousText: params.previousText,
        updatedText: params.updatedText,
        updatedAt: params.updatedAt.toISOString(),
      },
      params.resource,
    );
  },

  async enqueueDiscussionCreated(params: {
    requestId: string;
    actorUserId: string;
    workspaceId: string;
    discussionId: string;
    title: string;
    body: string;
  }): Promise<void> {
    await publishEvent(
      { kind: "discussion_created", ...params },
      { workspaceId: params.workspaceId, discussionId: params.discussionId, commentId: null },
    );
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
    await publishEvent(
      { kind: "comment_created", ...params },
      { workspaceId: params.workspaceId, discussionId: params.discussionId, commentId: params.commentId },
    );
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
      metadata: Prisma.JsonValue | null;
      readAt: Date | null;
      createdAt: Date;
      actor: { id: string; name: string | null; username: string | null } | null;
    }>
  > {
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
        metadata: true,
        readAt: true,
        createdAt: true,
        actor: {
          select: {
            id: true,
            name: true,
            username: true,
          },
        },
      },
    });

    const paginated = toPaginatedResult(rows, input.take);
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
