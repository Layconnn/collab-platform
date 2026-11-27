import argon2 from "argon2";

import { Prisma } from "../../app/generated/prisma/client";
import { prisma } from "../db/prisma";
import { AppError } from "../errors/app-error";
import { invalidateUserSessions } from "../middleware/auth";
import { recordActivity } from "./activity.service";
import { withdrawReviewsForMember } from "./decision-review.service";
import type { FileStorage } from "./files/storage";
import { recordSecurityEvent, sessionService, type Client } from "./session.service";
import { verifyTwoStepCode } from "./two-step.service";
import { invalidateMembershipCaches, invalidateUserWorkspaceLists, invalidateWorkspaceCache } from "./workspace.service";

// Your data (settings PRD, FR-17 to FR-19): download it, close the account
// with a 30-day grace period, and erase it once that has passed. Erasing keeps
// the user row so discussions, replies and decisions stay in their
// workspaces, attributed to "Former member"; everything personal goes.

export const GRACE_DAYS = 30;
export const FORMER_MEMBER = "Former member";
const DAY = 24 * 60 * 60 * 1000;

type Options = { client?: Client; sessionId?: string };

export const accountService = {
  // FR-17: everything a person put into Commons, as one JSON document.
  async exportData(userId: string, options: Options = {}) {
    const [user, memberships, discussions, comments, decisions, reactions, saved, preference, levels, digest, digestOptOuts] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, email: true, username: true, name: true, createdAt: true, usernameChangedAt: true, totpEnabledAt: true } }),
      prisma.workspaceMember.findMany({ where: { userId }, select: { role: true, createdAt: true, workspace: { select: { id: true, name: true, slug: true } } }, orderBy: { createdAt: "asc" } }),
      prisma.discussion.findMany({ where: { authorId: userId }, select: { id: true, workspaceId: true, title: true, body: true, createdAt: true, updatedAt: true }, orderBy: { createdAt: "asc" } }),
      prisma.comment.findMany({ where: { authorId: userId }, select: { id: true, workspaceId: true, discussionId: true, parentCommentId: true, body: true, createdAt: true, updatedAt: true }, orderBy: { createdAt: "asc" } }),
      prisma.decision.findMany({
        where: { createdById: userId, deletedAt: null },
        select: { id: true, workspaceId: true, sourceDiscussionId: true, question: true, outcome: true, rationale: true, alternatives: true, followUp: true, status: true, decidedAt: true, createdAt: true, updatedAt: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.reaction.findMany({ where: { userId }, select: { workspaceId: true, discussionId: true, commentId: true, emoji: true, createdAt: true }, orderBy: { createdAt: "asc" } }),
      prisma.savedItem.findMany({ where: { userId }, select: { workspaceId: true, discussionId: true, commentId: true, decisionId: true, createdAt: true }, orderBy: { createdAt: "asc" } }),
      prisma.userPreference.findUnique({ where: { userId }, select: { theme: true, motion: true, density: true, startPage: true, defaultWorkspaceId: true, mutedKinds: true, digestHour: true, timeZone: true } }),
      prisma.workspaceNotificationLevel.findMany({ where: { userId }, select: { workspaceId: true, level: true } }),
      prisma.digestPreference.findUnique({ where: { userId }, select: { enabled: true } }),
      prisma.digestWorkspaceOptOut.findMany({ where: { userId }, select: { workspaceId: true } }),
    ]);
    await recordSecurityEvent(userId, "DATA_EXPORTED", options);
    return {
      format: "commons-export",
      version: 1,
      exportedAt: new Date().toISOString(),
      profile: { ...user, twoStepSignIn: Boolean(user.totpEnabledAt), totpEnabledAt: undefined },
      memberships: memberships.map((row) => ({ workspaceId: row.workspace.id, workspace: row.workspace.name, slug: row.workspace.slug, role: row.role, joinedAt: row.createdAt })),
      discussions,
      replies: comments,
      decisions,
      reactions,
      savedItems: saved,
      settings: {
        preferences: preference,
        notificationLevels: levels,
        dailyDigest: { enabled: digest?.enabled ?? true, workspacesLeftOut: digestOptOuts.map((row) => row.workspaceId) },
      },
    };
  },

  // FR-18: the password (and a code with two-step on); refused while the
  // person owns a workspace; every session ends.
  async close(userId: string, input: { password: string; code?: string }, options: Options = {}) {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true, totpEnabledAt: true, closedAt: true } });
    if (user.closedAt) throw new AppError("CONFLICT", "This account is already closed.");
    if (!user.passwordHash || !(await argon2.verify(user.passwordHash, input.password))) {
      throw new AppError("FORBIDDEN", "Your password is incorrect.");
    }
    if (user.totpEnabledAt) {
      if (!input.code) throw new AppError("BAD_REQUEST", "Enter a code from your authenticator app or a recovery code.");
      if (!(await verifyTwoStepCode(userId, input.code, options))) throw new AppError("FORBIDDEN", "That code didn't work.");
    }
    const owned = await prisma.workspaceMember.findMany({ where: { userId, role: "OWNER" }, select: { workspace: { select: { name: true } } }, orderBy: { createdAt: "asc" } });
    if (owned.length) {
      const names = owned.map((row) => row.workspace.name);
      throw new AppError("CONFLICT", `Transfer ownership or delete ${names.length === 1 ? "this workspace" : "these workspaces"} first: ${names.join(", ")}.`);
    }

    const { count } = await prisma.user.updateMany({ where: { id: userId, closedAt: null }, data: { closedAt: new Date() } });
    if (count !== 1) throw new AppError("CONFLICT", "This account is already closed.");
    await recordSecurityEvent(userId, "ACCOUNT_CLOSED", options);
    await invalidateUserSessions(userId, null);
    const open = await prisma.userSession.findMany({ where: { userId, endedAt: null }, select: { id: true } });
    await sessionService.endSessions(userId, open.map((row) => row.id));
    return { closed: true as const, eraseAfter: new Date(Date.now() + GRACE_DAYS * DAY) };
  },

  // Signing in during the grace period restores the account (FR-18).
  async restoreIfClosed(userId: string, options: Options = {}) {
    const { count } = await prisma.user.updateMany({ where: { id: userId, closedAt: { not: null }, erasedAt: null }, data: { closedAt: null } });
    if (count === 1) await recordSecurityEvent(userId, "ACCOUNT_RESTORED", options);
    return count === 1;
  },

  // FR-19: accounts closed more than 30 days ago, a few at a time. An account
  // that owns a workspace again (ownership handed to it during the grace
  // period) is skipped and reported.
  async eraseClosedAccounts(options: { storage: FileStorage | null; deadline: number; now?: Date; batch?: number }) {
    const now = options.now ?? new Date();
    const result = { erased: 0, skipped: [] as string[], done: false };
    const due = await prisma.user.findMany({
      where: { closedAt: { lt: new Date(now.getTime() - GRACE_DAYS * DAY) }, erasedAt: null },
      select: { id: true },
      orderBy: { closedAt: "asc" },
      take: options.batch ?? 20,
    });
    for (const { id } of due) {
      if (Date.now() > options.deadline) return result;
      const outcome = await eraseAccount(id, options.storage);
      if (outcome === "erased") result.erased += 1;
      else result.skipped.push(id);
    }
    result.done = due.length < (options.batch ?? 20) || result.erased === 0;
    return result;
  },
};

async function eraseAccount(userId: string, storage: FileStorage | null): Promise<"erased" | "skipped"> {
  const owns = await prisma.workspaceMember.count({ where: { userId, role: "OWNER" } });
  if (owns) return "skipped";
  const before = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { avatarKey: true } });
  const memberships = await prisma.workspaceMember.findMany({ where: { userId }, select: { workspaceId: true, role: true } });

  await prisma.$transaction(async (tx) => {
    // Strip the row first, so every label written below reads "Former member".
    await tx.user.update({
      where: { id: userId },
      data: {
        email: `erased-${userId}@invalid.commons`,
        username: `former_${userId.slice(-22).toLowerCase()}`,
        name: FORMER_MEMBER,
        passwordHash: null,
        avatarKey: null,
        totpSecret: null,
        totpEnabledAt: null,
        totpLastStep: null,
        usernameChangedAt: null,
        erasedAt: new Date(),
      },
    });
    for (const membership of memberships) {
      await tx.workspaceMember.delete({ where: { workspaceId_userId: { workspaceId: membership.workspaceId, userId } } });
      await withdrawReviewsForMember(tx, membership.workspaceId, userId, { userId, label: FORMER_MEMBER });
      await recordActivity(tx, {
        workspaceId: membership.workspaceId,
        actorUserId: userId,
        actorLabel: FORMER_MEMBER,
        kind: "MEMBER_REMOVED",
        subjectType: "MEMBER",
        subjectId: userId,
        summary: { member: FORMER_MEMBER, previousRole: membership.role, left: true },
      });
    }
    // Personal data.
    await tx.userSession.deleteMany({ where: { userId } });
    await tx.securityEvent.deleteMany({ where: { userId } });
    await tx.userPreference.deleteMany({ where: { userId } });
    await tx.savedItem.deleteMany({ where: { userId } });
    await tx.discussionFollow.deleteMany({ where: { userId } });
    await tx.recoveryCode.deleteMany({ where: { userId } });
    await tx.notification.deleteMany({ where: { recipientUserId: userId } });
    await tx.digestDelivery.deleteMany({ where: { userId } });
    await tx.digestPreference.deleteMany({ where: { userId } });
    await tx.digestWorkspaceOptOut.deleteMany({ where: { userId } });
    // Names copied next to content.
    await tx.decision.updateMany({ where: { createdById: userId }, data: { createdByLabel: FORMER_MEMBER } });
    await tx.decisionRevision.updateMany({ where: { actorUserId: userId }, data: { actorLabel: FORMER_MEMBER } });
    await tx.decisionReview.updateMany({ where: { reviewerId: userId }, data: { reviewerLabel: FORMER_MEMBER } });
    await tx.decisionReview.updateMany({ where: { requestedById: userId }, data: { requestedByLabel: FORMER_MEMBER } });
    await tx.decisionSupersession.updateMany({ where: { authorizedById: userId }, data: { authorizedByLabel: FORMER_MEMBER } });
    await tx.activityEvent.updateMany({ where: { actorUserId: userId }, data: { actorLabel: FORMER_MEMBER } });
    await tx.discussionRevision.updateMany({ where: { editedById: userId }, data: { editorLabel: FORMER_MEMBER } });
    await tx.commentRevision.updateMany({ where: { editedById: userId }, data: { editorLabel: FORMER_MEMBER } });
    await tx.$executeRaw(Prisma.sql`
      UPDATE "ActivityEvent" SET "summary" = jsonb_set("summary"::jsonb, '{member}', to_jsonb(${FORMER_MEMBER}::text))
      WHERE "subjectType" = 'MEMBER' AND "subjectId" = ${userId} AND "summary" ? 'member'`);
    await tx.$executeRaw(Prisma.sql`
      UPDATE "ActivityEvent" SET "summary" = jsonb_set("summary"::jsonb, '{reviewer}', to_jsonb(${FORMER_MEMBER}::text))
      WHERE "summary"->>'reviewerId' = ${userId}`);
  });

  if (before.avatarKey && storage) await storage.delete(before.avatarKey).catch(() => undefined);
  await invalidateUserSessions(userId, null);
  await invalidateUserWorkspaceLists(userId);
  for (const membership of memberships) {
    await invalidateMembershipCaches(membership.workspaceId, userId);
    await invalidateWorkspaceCache(membership.workspaceId);
  }
  return "erased";
}
