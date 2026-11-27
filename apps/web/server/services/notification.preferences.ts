import type { NotificationJobData } from "../queue/notification.queue";
import { prisma } from "../db/prisma";

// What each person chose to hear about (settings PRD, FR-4, FR-5), applied to
// planned notifications before they are written. Read fresh for every event,
// so a change takes effect on the next one (NFR-3).

// Kinds that concern the person directly; "only what involves me" keeps them.
const ABOUT_YOU = new Set(["MENTION", "REVIEW_REQUESTED", "REVIEW_RESPONDED", "INVITE_ACCEPTED"]);

export async function applyNotificationPreferences(deliveries: NotificationJobData[]): Promise<NotificationJobData[]> {
  if (!deliveries.length) return deliveries;
  const userIds = [...new Set(deliveries.map((delivery) => delivery.recipientUserId))];
  const workspaceIds = [...new Set(deliveries.map((delivery) => delivery.workspaceId))];
  const [preferences, levels] = await Promise.all([
    prisma.userPreference.findMany({ where: { userId: { in: userIds }, mutedKinds: { isEmpty: false } }, select: { userId: true, mutedKinds: true } }),
    prisma.workspaceNotificationLevel.findMany({ where: { userId: { in: userIds }, workspaceId: { in: workspaceIds } }, select: { userId: true, workspaceId: true, level: true } }),
  ]);
  const muted = new Map(preferences.map((row) => [row.userId, new Set<string>(row.mutedKinds)]));
  const levelOf = new Map(levels.map((row) => [`${row.workspaceId}:${row.userId}`, row.level]));

  // For "only what involves me": replies count when they answer your comment
  // or are in a discussion you started.
  const involvedReplies = deliveries.filter((delivery) => delivery.type === "COMMENT_CREATED" && levelOf.get(`${delivery.workspaceId}:${delivery.recipientUserId}`) === "INVOLVED");
  const discussionIds = [...new Set(involvedReplies.map((delivery) => delivery.discussionId).filter((id): id is string => Boolean(id)))];
  const parentIds = [...new Set(involvedReplies.map((delivery) => delivery.metadata?.parentCommentId).filter((id): id is string => typeof id === "string"))];
  const [discussions, parents] = await Promise.all([
    discussionIds.length ? prisma.discussion.findMany({ where: { id: { in: discussionIds } }, select: { id: true, authorId: true } }) : [],
    parentIds.length ? prisma.comment.findMany({ where: { id: { in: parentIds } }, select: { id: true, authorId: true } }) : [],
  ]);
  const discussionAuthor = new Map(discussions.map((row) => [row.id, row.authorId]));
  const parentAuthor = new Map(parents.map((row) => [row.id, row.authorId]));

  return deliveries.filter((delivery) => {
    if (muted.get(delivery.recipientUserId)?.has(delivery.type)) return false;
    const level = levelOf.get(`${delivery.workspaceId}:${delivery.recipientUserId}`) ?? "ALL";
    if (level === "ALL") return true;
    if (level === "NONE") return false;
    if (ABOUT_YOU.has(delivery.type)) return true;
    if (delivery.type !== "COMMENT_CREATED") return false;
    const parent = delivery.metadata?.parentCommentId;
    return (typeof parent === "string" && parentAuthor.get(parent) === delivery.recipientUserId)
      || (delivery.discussionId ? discussionAuthor.get(delivery.discussionId) === delivery.recipientUserId : false);
  });
}
