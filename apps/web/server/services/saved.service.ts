import type { ListSavedInput, SavedInWorkspaceInput, SetSavedInput } from "@repo/validators/discussion";
import { Prisma } from "../../app/generated/prisma/client";

import { prisma } from "../db/prisma";
import { AppError } from "../errors/app-error";
import { activityActorLabel } from "./activity.service";
import { excerpt } from "./pin.service";

// Saved items (Markdown, reactions, follow and pin PRD, FR-16 to FR-18): a
// member's private list of discussions, replies and decisions to come back to.

const IDS_LIMIT = 500;

async function requireMember(workspaceId: string, userId: string) {
  const member = await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } }, select: { id: true } });
  if (!member) throw new AppError("NOT_FOUND", "Not found.");
}

export const savedService = {
  // What the member saved in one workspace, so save buttons know their state.
  async idsInWorkspace(userId: string, input: SavedInWorkspaceInput) {
    await requireMember(input.workspaceId, userId);
    const rows = await prisma.savedItem.findMany({
      where: { userId, workspaceId: input.workspaceId },
      select: { discussionId: true, commentId: true, decisionId: true },
      orderBy: { createdAt: "desc" },
      take: IDS_LIMIT,
    });
    return {
      discussionIds: rows.flatMap((row) => (row.discussionId ? [row.discussionId] : [])),
      commentIds: rows.flatMap((row) => (row.commentId ? [row.commentId] : [])),
      decisionIds: rows.flatMap((row) => (row.decisionId ? [row.decisionId] : [])),
    };
  },

  // Saves or unsaves; repeating a request changes nothing.
  async set(userId: string, input: SetSavedInput) {
    await requireMember(input.workspaceId, userId);
    const subject = input.discussionId
      ? await prisma.discussion.findFirst({ where: { id: input.discussionId, workspaceId: input.workspaceId }, select: { id: true } })
      : input.commentId
        ? await prisma.comment.findFirst({ where: { id: input.commentId, workspaceId: input.workspaceId }, select: { id: true } })
        : await prisma.decision.findFirst({ where: { id: input.decisionId, workspaceId: input.workspaceId, deletedAt: null }, select: { id: true } });
    if (!subject) throw new AppError("NOT_FOUND", "Not found.");
    const target = input.discussionId ? { discussionId: input.discussionId } : input.commentId ? { commentId: input.commentId } : { decisionId: input.decisionId };
    if (input.saved) {
      try {
        await prisma.savedItem.create({ data: { userId, workspaceId: input.workspaceId, ...target } });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
      }
    } else {
      await prisma.savedItem.deleteMany({ where: { userId, workspaceId: input.workspaceId, ...target } });
    }
    return this.idsInWorkspace(userId, { workspaceId: input.workspaceId });
  },

  // The Saved page: newest first, across the member's current workspaces only;
  // deleted decisions are left out (FR-17).
  async list(userId: string, input: ListSavedInput) {
    const rows = await prisma.savedItem.findMany({
      where: {
        userId,
        workspace: { members: { some: { userId } } },
        OR: [{ decisionId: null }, { decision: { deletedAt: null } }],
        ...(input.cursor ? { id: { lt: input.cursor } } : {}),
      },
      // Ids are time-ordered (cuid), so the id cursor pages in saving order.
      orderBy: { id: "desc" },
      take: input.take + 1,
      select: {
        id: true, createdAt: true,
        workspace: { select: { id: true, name: true } },
        discussion: { select: { id: true, title: true, body: true, author: { select: { name: true, username: true } } } },
        comment: { select: { id: true, body: true, discussionId: true, author: { select: { name: true, username: true } }, discussion: { select: { title: true } } } },
        decision: { select: { id: true, question: true, status: true, createdByLabel: true } },
      },
    });
    const page = rows.slice(0, input.take);
    return {
      items: page.map((row) => {
        if (row.discussion) return { id: row.id, savedAt: row.createdAt, workspace: row.workspace, type: "DISCUSSION" as const, target: { discussionId: row.discussion.id }, title: row.discussion.title, excerpt: excerpt(row.discussion.body), by: activityActorLabel(row.discussion.author), href: `/workspace/${row.workspace.id}/discussions/${row.discussion.id}` };
        if (row.comment) return { id: row.id, savedAt: row.createdAt, workspace: row.workspace, type: "REPLY" as const, target: { commentId: row.comment.id }, title: row.comment.discussion.title, excerpt: excerpt(row.comment.body), by: activityActorLabel(row.comment.author), href: `/workspace/${row.workspace.id}/discussions/${row.comment.discussionId}#comment-${row.comment.id}` };
        return { id: row.id, savedAt: row.createdAt, workspace: row.workspace, type: "DECISION" as const, target: { decisionId: row.decision!.id }, title: row.decision!.question, excerpt: row.decision!.status === "DECIDED" ? "Finalized decision" : row.decision!.status === "PROPOSED" ? "Proposal" : "Superseded decision", by: row.decision!.createdByLabel, href: `/workspace/${row.workspace.id}/decisions/${row.decision!.id}` };
      }),
      nextCursor: rows.length > input.take ? page.at(-1)?.id ?? null : null,
    };
  },
};
