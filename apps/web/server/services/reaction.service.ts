import { REACTION_EMOJI, type DiscussionReactionsInput, type SetReactionInput } from "@repo/validators/discussion";
import { Prisma } from "../../app/generated/prisma/client";

import { prisma } from "../db/prisma";
import { AppError } from "../errors/app-error";
import { activityActorLabel } from "./activity.service";

// Reactions on discussions and replies (Markdown, reactions, follow and pin
// PRD, FR-6 to FR-8). Members react for themselves; everyone in the workspace
// sees counts and who reacted.

const PEOPLE_SHOWN = 10;

export type ReactionSummary = {
  emoji: string;
  count: number;
  mine: boolean;
  // Up to ten names, the viewer's first.
  people: string[];
};

type Row = { emoji: string; userId: string; discussionId: string | null; commentId: string | null; user: { name: string | null; username: string } };

function summarize(rows: Row[], viewerId: string): ReactionSummary[] {
  return REACTION_EMOJI.flatMap((emoji) => {
    const matching = rows.filter((row) => row.emoji === emoji);
    if (!matching.length) return [];
    const ordered = [...matching].sort((a, b) => Number(b.userId === viewerId) - Number(a.userId === viewerId));
    return [{
      emoji,
      count: matching.length,
      mine: matching.some((row) => row.userId === viewerId),
      people: ordered.slice(0, PEOPLE_SHOWN).map((row) => (row.userId === viewerId ? "You" : activityActorLabel(row.user))),
    }];
  });
}

const rowSelect = { emoji: true, userId: true, discussionId: true, commentId: true, user: { select: { name: true, username: true } } } as const;

async function requireMember(workspaceId: string, userId: string) {
  const member = await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } }, select: { id: true } });
  if (!member) throw new AppError("NOT_FOUND", "Discussion not found.");
}

export const reactionService = {
  // Every reaction in a discussion, for the discussion and all its replies, in
  // one query (FR-8).
  async forDiscussion(userId: string, input: DiscussionReactionsInput) {
    await requireMember(input.workspaceId, userId);
    const discussion = await prisma.discussion.findFirst({
      where: { id: input.discussionId, workspaceId: input.workspaceId, workspace: { members: { some: { userId } } } },
      select: { id: true },
    });
    if (!discussion) throw new AppError("NOT_FOUND", "Discussion not found.");
    const rows = await prisma.reaction.findMany({
      where: { workspaceId: input.workspaceId, OR: [{ discussionId: discussion.id }, { comment: { discussionId: discussion.id } }] },
      select: rowSelect,
      orderBy: { createdAt: "asc" },
    });
    const byComment = new Map<string, Row[]>();
    for (const row of rows) {
      if (!row.commentId) continue;
      byComment.set(row.commentId, [...(byComment.get(row.commentId) ?? []), row]);
    }
    return {
      discussion: summarize(rows.filter((row) => row.discussionId), userId),
      comments: Object.fromEntries([...byComment].map(([commentId, list]) => [commentId, summarize(list, userId)])),
    };
  },

  async set(userId: string, input: SetReactionInput) {
    await requireMember(input.workspaceId, userId);
    // The subject must belong to the workspace named in the request.
    const subject = input.discussionId
      ? await prisma.discussion.findFirst({ where: { id: input.discussionId, workspaceId: input.workspaceId }, select: { id: true } })
      : await prisma.comment.findFirst({ where: { id: input.commentId, workspaceId: input.workspaceId }, select: { id: true } });
    if (!subject) throw new AppError("NOT_FOUND", input.discussionId ? "Discussion not found." : "Reply not found.");
    const target = input.discussionId ? { discussionId: input.discussionId } : { commentId: input.commentId };

    if (input.active) {
      try {
        await prisma.reaction.create({ data: { workspaceId: input.workspaceId, userId, emoji: input.emoji, ...target } });
      } catch (error) {
        // Already reacted: a retry or a second click leaves one reaction.
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
      }
    } else {
      await prisma.reaction.deleteMany({ where: { workspaceId: input.workspaceId, userId, emoji: input.emoji, ...target } });
    }
    const rows = await prisma.reaction.findMany({ where: { workspaceId: input.workspaceId, ...target }, select: rowSelect, orderBy: { createdAt: "asc" } });
    return { ...target, reactions: summarize(rows, userId) };
  },
};
