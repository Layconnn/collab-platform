import type { DiscussionFollowInput, SetDiscussionFollowInput } from "@repo/validators/discussion";
import type { Prisma } from "../../app/generated/prisma/client";

import { prisma } from "../db/prisma";
import { AppError } from "../errors/app-error";

// Following and muting discussions (Markdown, reactions, follow and pin PRD,
// FR-9 to FR-12). Followers hear about new replies; muted members do not.

type Tx = Prisma.TransactionClient;
export type FollowStatus = "FOLLOWING" | "MUTED" | "NONE";

// Starting or replying to a discussion follows it, unless the member muted it.
export async function followOnParticipation(tx: Tx, input: { workspaceId: string; discussionId: string; userId: string }) {
  await tx.discussionFollow.upsert({
    where: { discussionId_userId: { discussionId: input.discussionId, userId: input.userId } },
    create: { workspaceId: input.workspaceId, discussionId: input.discussionId, userId: input.userId, state: "FOLLOWING" },
    update: {},
  });
}

// Members who follow a discussion, for reply notifications.
export async function discussionFollowerIds(workspaceId: string, discussionId: string): Promise<Set<string>> {
  const rows = await prisma.discussionFollow.findMany({
    where: { workspaceId, discussionId, state: "FOLLOWING", user: { memberships: { some: { workspaceId } } } },
    select: { userId: true },
  });
  return new Set(rows.map((row) => row.userId));
}

async function requireDiscussion(userId: string, input: DiscussionFollowInput) {
  const discussion = await prisma.discussion.findFirst({
    where: { id: input.discussionId, workspaceId: input.workspaceId, workspace: { members: { some: { userId } } } },
    select: { id: true },
  });
  if (!discussion) throw new AppError("NOT_FOUND", "Discussion not found.");
}

export const followService = {
  async get(userId: string, input: DiscussionFollowInput): Promise<{ status: FollowStatus; followers: number }> {
    await requireDiscussion(userId, input);
    const [mine, followers] = await Promise.all([
      prisma.discussionFollow.findUnique({ where: { discussionId_userId: { discussionId: input.discussionId, userId } }, select: { state: true } }),
      prisma.discussionFollow.count({ where: { discussionId: input.discussionId, workspaceId: input.workspaceId, state: "FOLLOWING" } }),
    ]);
    return { status: mine?.state ?? "NONE", followers };
  },

  // Sets the member's own state; repeating a request changes nothing.
  async set(userId: string, input: SetDiscussionFollowInput) {
    await requireDiscussion(userId, input);
    const where = { discussionId_userId: { discussionId: input.discussionId, userId } };
    if (input.status === "NONE") {
      await prisma.discussionFollow.deleteMany({ where: { discussionId: input.discussionId, userId } });
    } else {
      await prisma.discussionFollow.upsert({
        where,
        create: { workspaceId: input.workspaceId, discussionId: input.discussionId, userId, state: input.status },
        update: { state: input.status },
      });
    }
    return this.get(userId, input);
  },
};
