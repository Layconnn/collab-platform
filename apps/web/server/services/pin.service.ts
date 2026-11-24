import { MAX_PINNED_REPLIES, type PinnedRepliesInput, type SetPinnedReplyInput } from "@repo/validators/discussion";
import type { WorkspaceRole } from "../../app/generated/prisma/client";

import { prisma } from "../db/prisma";
import { AppError } from "../errors/app-error";
import { activityActorLabel, recordActivity } from "./activity.service";
import { canManageDecisions } from "./workspace.permissions";

// Pinned replies (Markdown, reactions, follow and pin PRD, FR-13 to FR-15):
// the discussion's author or a manager pins up to three replies to the top.
// Deleting a reply removes its pin with it.

const EXCERPT = 160;

// Markdown reduced to a one-line excerpt for the pinned strip and the log.
export function excerpt(body: string) {
  const plain = body
    .replace(/```[\s\S]*?```/g, " [code] ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^[#>\-*+\d.\s]+|[*_~]/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > EXCERPT ? `${plain.slice(0, EXCERPT - 1)}…` : plain;
}

const canPin = (role: WorkspaceRole, isDiscussionAuthor: boolean) => isDiscussionAuthor || canManageDecisions(role);

export const pinService = {
  async list(userId: string, input: PinnedRepliesInput) {
    const discussion = await prisma.discussion.findFirst({
      where: { id: input.discussionId, workspaceId: input.workspaceId, workspace: { members: { some: { userId } } } },
      select: { authorId: true, workspace: { select: { members: { where: { userId }, select: { role: true } } } } },
    });
    const role = discussion?.workspace.members[0]?.role;
    if (!discussion || !role) throw new AppError("NOT_FOUND", "Discussion not found.");
    const pinned = await prisma.comment.findMany({
      where: { discussionId: input.discussionId, workspaceId: input.workspaceId, pinnedAt: { not: null } },
      orderBy: { pinnedAt: "asc" },
      select: {
        id: true, body: true, pinnedAt: true, createdAt: true,
        author: { select: { name: true, username: true } },
        pinnedBy: { select: { name: true, username: true } },
      },
    });
    return {
      canPin: canPin(role, discussion.authorId === userId),
      max: MAX_PINNED_REPLIES,
      items: pinned.map((comment) => ({
        commentId: comment.id,
        excerpt: excerpt(comment.body),
        author: activityActorLabel(comment.author),
        pinnedBy: comment.pinnedBy ? activityActorLabel(comment.pinnedBy) : null,
        pinnedAt: comment.pinnedAt!,
        createdAt: comment.createdAt,
      })),
    };
  },

  // Sets a reply's pin on or off; repeating a request changes nothing.
  async set(userId: string, input: SetPinnedReplyInput) {
    const discussionId = await prisma.$transaction(async (tx) => {
      const member = await tx.$queryRaw<Array<{ role: WorkspaceRole }>>`
        SELECT "role" FROM "WorkspaceMember" WHERE "workspaceId" = ${input.workspaceId} AND "userId" = ${userId} FOR SHARE
      `;
      if (!member[0]) throw new AppError("NOT_FOUND", "Reply not found.");
      const comment = await tx.comment.findFirst({
        where: { id: input.commentId, workspaceId: input.workspaceId },
        select: { id: true, body: true, pinnedAt: true, discussion: { select: { id: true, title: true, authorId: true } } },
      });
      if (!comment) throw new AppError("NOT_FOUND", "Reply not found.");
      if (!canPin(member[0].role, comment.discussion.authorId === userId)) {
        throw new AppError("FORBIDDEN", "Only the discussion's author or a workspace manager can pin replies.");
      }
      // One pin change per discussion at a time, so the limit holds.
      await tx.$queryRaw`SELECT "id" FROM "Discussion" WHERE "id" = ${comment.discussion.id} FOR UPDATE`;
      if (Boolean(comment.pinnedAt) === input.pinned) return comment.discussion.id;
      if (input.pinned) {
        const count = await tx.comment.count({ where: { discussionId: comment.discussion.id, pinnedAt: { not: null } } });
        if (count >= MAX_PINNED_REPLIES) throw new AppError("CONFLICT", `At most ${MAX_PINNED_REPLIES} replies can be pinned. Unpin one first.`);
      }
      await tx.comment.update({
        where: { id: comment.id },
        data: input.pinned ? { pinnedAt: new Date(), pinnedById: userId } : { pinnedAt: null, pinnedById: null },
      });
      await recordActivity(tx, {
        workspaceId: input.workspaceId,
        actorUserId: userId,
        kind: input.pinned ? "COMMENT_PINNED" : "COMMENT_UNPINNED",
        subjectType: "COMMENT",
        subjectId: comment.id,
        summary: { discussionId: comment.discussion.id, title: comment.discussion.title, excerpt: excerpt(comment.body) },
      });
      return comment.discussion.id;
    });
    return this.list(userId, { workspaceId: input.workspaceId, discussionId });
  },
};
