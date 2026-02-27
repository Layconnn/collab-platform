import type {
  CreateDiscussionInput,
  DeleteDiscussionInput,
  GetDiscussionByIdInput,
  ListDiscussionsInput,
  UpdateDiscussionInput,
} from "@repo/validators/discussion";
import { Prisma } from "../../app/generated/prisma/client";

import { redis } from "../cache/redis";
import { redisCache } from "../cache/redis";
import { prisma } from "../db/prisma";
import { AppError } from "../errors/app-error";
import {
  recordDiscussionAudit,
  recordDiscussionOperation,
  recordDiscussionPermissionDenied,
} from "../observability/security-events";
import {
  WORKSPACE_ACTIONS,
  canPerformWorkspaceAction,
} from "./workspace.permissions";

const DISCUSSION_TTL_SECONDS = 120;
const DISCUSSION_LIST_TTL_SECONDS = 60;
const DISCUSSION_CREATE_IDEMPOTENCY_TTL_SECONDS = 60 * 60;

type RequestContext = {
  requestId: string;
};

type PaginatedResult<T> = {
  items: T[];
  nextCursor: string | null;
};

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

function discussionByIdKey(discussionId: string): string {
  return `discussion:${discussionId}`;
}

function workspaceDiscussionListKey(
  workspaceId: string,
  cursor: string | undefined,
  take: number,
): string {
  return `workspace:${workspaceId}:discussions:${cursor ?? "start"}:${take}`;
}

async function invalidateDiscussionCaches(
  workspaceId: string,
  discussionId?: string,
): Promise<void> {
  if (discussionId) {
    await redisCache.del(discussionByIdKey(discussionId));
  }
  await redisCache.delByPattern(`workspace:${workspaceId}:discussions:*`);
}

async function getWorkspaceRole(workspaceId: string, userId: string) {
  return prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId,
      },
    },
    select: {
      role: true,
    },
  });
}

async function requireWorkspaceAction(
  workspaceId: string,
  userId: string,
  action: (typeof WORKSPACE_ACTIONS)[keyof typeof WORKSPACE_ACTIONS],
  requestId: string,
) {
  const membership = await getWorkspaceRole(workspaceId, userId);
  if (!membership) {
    await recordDiscussionPermissionDenied({
      requestId,
      userId,
      workspaceId,
      action,
      reason: "not_workspace_member",
      timestamp: new Date().toISOString(),
    });
    throw new AppError("FORBIDDEN", "You are not a member of this workspace.");
  }

  if (!canPerformWorkspaceAction(membership.role, action)) {
    await recordDiscussionPermissionDenied({
      requestId,
      userId,
      workspaceId,
      action,
      reason: `role_${membership.role.toLowerCase()}_not_allowed`,
      timestamp: new Date().toISOString(),
    });
    throw new AppError("FORBIDDEN", "Insufficient permissions for this action.");
  }

  return membership.role;
}

export const discussionService = {
  async create(
    userId: string,
    input: CreateDiscussionInput,
    context: RequestContext,
  ) {
    const idempotencyKey = input.idempotencyKey?.trim();
    const idempotencyResultKey = idempotencyKey
      ? `idempotency:discussion:create:result:${input.workspaceId}:${userId}:${idempotencyKey}`
      : null;
    const idempotencyLockKey = idempotencyKey
      ? `idempotency:discussion:create:lock:${input.workspaceId}:${userId}:${idempotencyKey}`
      : null;

    if (idempotencyResultKey) {
      const cachedResult = await redisCache.getJSON<{
        id: string;
        workspaceId: string;
        title: string;
        body: string;
        author: { id: string; name: string | null };
        createdAt: Date;
        updatedAt: Date;
      }>(idempotencyResultKey);
      if (cachedResult) {
        return cachedResult;
      }
    }

    if (idempotencyLockKey) {
      const lockAcquired = await redis.set(
        idempotencyLockKey,
        "1",
        "EX",
        30,
        "NX",
      );
      if (!lockAcquired) {
        throw new AppError("CONFLICT", "Duplicate create request in progress.");
      }
    }

    await requireWorkspaceAction(
      input.workspaceId,
      userId,
      WORKSPACE_ACTIONS.CREATE_DISCUSSION,
      context.requestId,
    );

    try {
      const discussion = await prisma.discussion.create({
        data: {
          workspaceId: input.workspaceId,
          authorId: userId,
          title: input.title,
          body: input.body,
        },
        select: {
          id: true,
          workspaceId: true,
          title: true,
          body: true,
          author: {
            select: {
              id: true,
              name: true,
            },
          },
          createdAt: true,
          updatedAt: true,
        },
      });

      await invalidateDiscussionCaches(input.workspaceId, discussion.id);
      await recordDiscussionOperation({
        requestId: context.requestId,
        actorUserId: userId,
        workspaceId: discussion.workspaceId,
        discussionId: discussion.id,
        action: "create",
        timestamp: new Date().toISOString(),
      });
      await recordDiscussionAudit({
        requestId: context.requestId,
        actorUserId: userId,
        workspaceId: discussion.workspaceId,
        discussionId: discussion.id,
        action: "create",
        timestamp: new Date().toISOString(),
      });

      if (idempotencyResultKey) {
        await redisCache.setJSON(
          idempotencyResultKey,
          discussion,
          DISCUSSION_CREATE_IDEMPOTENCY_TTL_SECONDS,
        );
      }

      return discussion;
    } finally {
      if (idempotencyLockKey) {
        await redis.del(idempotencyLockKey);
      }
    }
  },

  async listByWorkspace(
    userId: string,
    input: ListDiscussionsInput,
    context: RequestContext,
  ) {
    await requireWorkspaceAction(
      input.workspaceId,
      userId,
      WORKSPACE_ACTIONS.READ_DISCUSSION,
      context.requestId,
    );

    const cacheKey = workspaceDiscussionListKey(
      input.workspaceId,
      input.cursor,
      input.take,
    );
    const cached = await redisCache.getJSON<
      PaginatedResult<{
        id: string;
        workspaceId: string;
        title: string;
        author: {
          id: string;
          name: string | null;
        };
        createdAt: Date;
        updatedAt: Date;
      }>
    >(cacheKey);
    if (cached) {
      await recordDiscussionOperation({
        requestId: context.requestId,
        actorUserId: userId,
        workspaceId: input.workspaceId,
        discussionId: null,
        action: "list",
        timestamp: new Date().toISOString(),
      });
      await recordDiscussionAudit({
        requestId: context.requestId,
        actorUserId: userId,
        workspaceId: input.workspaceId,
        discussionId: null,
        action: "list",
        timestamp: new Date().toISOString(),
      });
      return cached;
    }

    const rows = await prisma.discussion.findMany({
      where: {
        workspaceId: input.workspaceId,
      },
      take: input.take + 1,
      skip: input.cursor ? 1 : 0,
      cursor: input.cursor ? { id: input.cursor } : undefined,
      orderBy: {
        id: "desc",
      },
      select: {
        id: true,
        workspaceId: true,
        title: true,
        author: {
          select: {
            id: true,
            name: true,
          },
        },
        createdAt: true,
        updatedAt: true,
      },
    });

    const paginated = toPaginatedResult(rows, input.take);
    await redisCache.setJSON(cacheKey, paginated, DISCUSSION_LIST_TTL_SECONDS);
    await recordDiscussionOperation({
      requestId: context.requestId,
      actorUserId: userId,
      workspaceId: input.workspaceId,
      discussionId: null,
      action: "list",
      timestamp: new Date().toISOString(),
    });
    await recordDiscussionAudit({
      requestId: context.requestId,
      actorUserId: userId,
      workspaceId: input.workspaceId,
      discussionId: null,
      action: "list",
      timestamp: new Date().toISOString(),
    });

    return paginated;
  },

  async getById(
    userId: string,
    input: GetDiscussionByIdInput,
    context: RequestContext,
  ) {
    const cacheKey = discussionByIdKey(input.discussionId);
    const cached = await redisCache.getJSON<{
      id: string;
      workspaceId: string;
      title: string;
      body: string;
      author: {
        id: string;
        name: string | null;
      };
      createdAt: Date;
      updatedAt: Date;
    }>(cacheKey);

    if (cached) {
      await requireWorkspaceAction(
        cached.workspaceId,
        userId,
        WORKSPACE_ACTIONS.READ_DISCUSSION,
        context.requestId,
      );
      return cached;
    }

    const discussion = await prisma.discussion.findUnique({
      where: { id: input.discussionId },
      select: {
        id: true,
        workspaceId: true,
        title: true,
        body: true,
        author: {
          select: {
            id: true,
            name: true,
          },
        },
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!discussion) {
      throw new AppError("NOT_FOUND", "Discussion not found.");
    }

    await requireWorkspaceAction(
      discussion.workspaceId,
      userId,
      WORKSPACE_ACTIONS.READ_DISCUSSION,
      context.requestId,
    );

    await redisCache.setJSON(cacheKey, discussion, DISCUSSION_TTL_SECONDS);
    return discussion;
  },

  async update(
    userId: string,
    input: UpdateDiscussionInput,
    context: RequestContext,
  ) {
    const discussion = await prisma.discussion.findUnique({
      where: { id: input.discussionId },
      select: {
        id: true,
        workspaceId: true,
        authorId: true,
      },
    });

    if (!discussion) {
      throw new AppError("NOT_FOUND", "Discussion not found.");
    }

    const role = await requireWorkspaceAction(
      discussion.workspaceId,
      userId,
      WORKSPACE_ACTIONS.READ_DISCUSSION,
      context.requestId,
    );

    const canManageDiscussion = canPerformWorkspaceAction(
      role,
      WORKSPACE_ACTIONS.MANAGE_DISCUSSION,
    );

    if (discussion.authorId !== userId && !canManageDiscussion) {
      await recordDiscussionPermissionDenied({
        requestId: context.requestId,
        userId,
        workspaceId: discussion.workspaceId,
        action: "update_discussion",
        reason: "not_author_or_manager",
        timestamp: new Date().toISOString(),
      });
      throw new AppError(
        "FORBIDDEN",
        "Only author, admin, or owner can update this discussion.",
      );
    }

    try {
      const updated = await prisma.discussion.update({
        where: { id: input.discussionId },
        data: {
          title: input.title,
          body: input.body,
        },
        select: {
          id: true,
          workspaceId: true,
          title: true,
          body: true,
          author: {
            select: {
              id: true,
              name: true,
            },
          },
          createdAt: true,
          updatedAt: true,
        },
      });

      await invalidateDiscussionCaches(updated.workspaceId, updated.id);
      await recordDiscussionOperation({
        requestId: context.requestId,
        actorUserId: userId,
        workspaceId: updated.workspaceId,
        discussionId: updated.id,
        action: "update",
        timestamp: new Date().toISOString(),
      });
      await recordDiscussionAudit({
        requestId: context.requestId,
        actorUserId: userId,
        workspaceId: updated.workspaceId,
        discussionId: updated.id,
        action: "update",
        timestamp: new Date().toISOString(),
      });

      return updated;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        throw new AppError("NOT_FOUND", "Discussion not found.", {
          cause: error,
        });
      }
      throw error;
    }
  },

  async remove(
    userId: string,
    input: DeleteDiscussionInput,
    context: RequestContext,
  ) {
    const discussion = await prisma.discussion.findUnique({
      where: { id: input.discussionId },
      select: {
        id: true,
        workspaceId: true,
        authorId: true,
      },
    });

    if (!discussion) {
      throw new AppError("NOT_FOUND", "Discussion not found.");
    }

    const role = await requireWorkspaceAction(
      discussion.workspaceId,
      userId,
      WORKSPACE_ACTIONS.READ_DISCUSSION,
      context.requestId,
    );

    const canManageDiscussion = canPerformWorkspaceAction(
      role,
      WORKSPACE_ACTIONS.MANAGE_DISCUSSION,
    );

    if (discussion.authorId !== userId && !canManageDiscussion) {
      await recordDiscussionPermissionDenied({
        requestId: context.requestId,
        userId,
        workspaceId: discussion.workspaceId,
        action: "delete_discussion",
        reason: "not_author_or_manager",
        timestamp: new Date().toISOString(),
      });
      throw new AppError(
        "FORBIDDEN",
        "Only author, admin, or owner can delete this discussion.",
      );
    }

    await prisma.discussion.delete({
      where: { id: input.discussionId },
    });

    await invalidateDiscussionCaches(discussion.workspaceId, discussion.id);
    await recordDiscussionOperation({
      requestId: context.requestId,
      actorUserId: userId,
      workspaceId: discussion.workspaceId,
      discussionId: discussion.id,
      action: "delete",
      timestamp: new Date().toISOString(),
    });
    await recordDiscussionAudit({
      requestId: context.requestId,
      actorUserId: userId,
      workspaceId: discussion.workspaceId,
      discussionId: discussion.id,
      action: "delete",
      timestamp: new Date().toISOString(),
    });

    return { success: true as const };
  },
};
