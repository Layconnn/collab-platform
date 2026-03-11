import type {
  CreateCommentInput,
  DeleteCommentInput,
  ListCommentsInput,
  UpdateCommentInput,
} from "@repo/validators/comment";

import { redis } from "../cache/redis";
import { redisCache } from "../cache/redis";
import { prisma } from "../db/prisma";
import { AppError } from "../errors/app-error";
import {
  recordCommentAudit,
  recordCommentIdempotency,
  recordCommentOperation,
  recordCommentPermissionDenied,
} from "../observability/security-events";
import { notificationService } from "./notification.service";
import { toPaginatedResult, type PaginatedResult } from "@/src/common/utils/pagination";
import {
  WORKSPACE_ACTIONS,
  canPerformWorkspaceAction,
} from "./workspace.permissions";

const COMMENT_TTL_SECONDS = 120;
const COMMENT_LIST_TTL_SECONDS = 60;
const COMMENT_CREATE_IDEMPOTENCY_TTL_SECONDS = 60 * 60;
const MAX_COMMENT_DEPTH = 8;

type RequestContext = {
  requestId: string;
};

type DiscussionScope = {
  id: string;
  workspaceId: string;
};

type PublicComment = {
  id: string;
  discussionId: string;
  parentCommentId: string | null;
  depth: number;
  body: string;
  author: {
    id: string;
    name: string | null;
  };
  createdAt: Date;
  updatedAt: Date;
};

type CommentWithWorkspace = PublicComment & {
  workspaceId: string;
};

type CreateIdempotencyResult = {
  commentId: string;
  workspaceId: string;
};

function commentByIdKey(commentId: string): string {
  return `comment:${commentId}`;
}

function discussionCommentListKey(
  discussionId: string,
  parentCommentId: string | undefined,
  cursor: string | undefined,
  take: number,
): string {
  return `discussion:${discussionId}:comments:${parentCommentId ?? "root"}:${cursor ?? "start"}:${take}`;
}

async function invalidateCommentCaches(
  discussionId: string,
  commentId?: string,
): Promise<void> {
  if (commentId) {
    await redisCache.del(commentByIdKey(commentId));
  }
  await redisCache.delByPattern(`discussion:${discussionId}:comments:*`);
}

async function getDiscussionScope(discussionId: string): Promise<DiscussionScope> {
  const discussion = await prisma.discussion.findUnique({
    where: { id: discussionId },
    select: {
      id: true,
      workspaceId: true,
    },
  });

  if (!discussion) {
    throw new AppError("NOT_FOUND", "Discussion not found.");
  }

  return discussion;
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
    await recordCommentPermissionDenied({
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
    await recordCommentPermissionDenied({
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

async function validateParentComment(
  discussionId: string,
  parentCommentId: string,
): Promise<number> {
  const parent = await prisma.comment.findUnique({
    where: { id: parentCommentId },
    select: {
      id: true,
      discussionId: true,
      depth: true,
    },
  });

  if (!parent) {
    throw new AppError("NOT_FOUND", "Parent comment not found.");
  }

  if (parent.discussionId !== discussionId) {
    throw new AppError("BAD_REQUEST", "Parent comment must belong to the same discussion.");
  }

  const nextDepth = parent.depth + 1;
  if (nextDepth > MAX_COMMENT_DEPTH) {
    throw new AppError(
      "BAD_REQUEST",
      `Comment nesting depth exceeds max allowed depth (${MAX_COMMENT_DEPTH}).`,
    );
  }

  return nextDepth;
}

async function getCommentByIdWithWorkspace(
  commentId: string,
): Promise<CommentWithWorkspace | null> {
  return prisma.comment.findUnique({
    where: { id: commentId },
    select: {
      id: true,
      discussionId: true,
      workspaceId: true,
      parentCommentId: true,
      depth: true,
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
}

function toPublicComment(comment: CommentWithWorkspace): PublicComment {
  const { workspaceId: _workspaceId, ...publicComment } = comment;
  return publicComment;
}

function normalizeForeignTenantDeniedAsNotFound(error: unknown): never {
  if (error instanceof AppError && error.code === "FORBIDDEN") {
    throw new AppError("NOT_FOUND", "Comment not found.");
  }
  throw error;
}

export const commentService = {
  async create(
    userId: string,
    input: CreateCommentInput,
    context: RequestContext,
  ): Promise<PublicComment> {
    const idempotencyKey = input.idempotencyKey?.trim();
    const idempotencyResultKey = idempotencyKey
      ? `idempotency:comment:create:result:${input.discussionId}:${userId}:${idempotencyKey}`
      : null;
    const idempotencyLockKey = idempotencyKey
      ? `idempotency:comment:create:lock:${input.discussionId}:${userId}:${idempotencyKey}`
      : null;

    if (idempotencyResultKey) {
      const cachedResult = await redisCache.getJSON<CreateIdempotencyResult>(idempotencyResultKey);
      if (cachedResult) {
        await recordCommentIdempotency({
          requestId: context.requestId,
          actorUserId: userId,
          discussionId: input.discussionId,
          outcome: "hit",
          timestamp: new Date().toISOString(),
        });

        await requireWorkspaceAction(
          cachedResult.workspaceId,
          userId,
          WORKSPACE_ACTIONS.CREATE_COMMENT,
          context.requestId,
        );

        const fresh = await getCommentByIdWithWorkspace(cachedResult.commentId);
        if (!fresh) {
          await redisCache.del(idempotencyResultKey);
        } else {
          return toPublicComment(fresh);
        }
      }
    }

    if (idempotencyKey) {
      await recordCommentIdempotency({
        requestId: context.requestId,
        actorUserId: userId,
        discussionId: input.discussionId,
        outcome: "miss",
        timestamp: new Date().toISOString(),
      });
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

    const discussion = await getDiscussionScope(input.discussionId);
    await requireWorkspaceAction(discussion.workspaceId, userId, WORKSPACE_ACTIONS.CREATE_COMMENT, context.requestId);

    try {
      const depth = input.parentCommentId
        ? await validateParentComment(input.discussionId, input.parentCommentId)
        : 0;

      const comment = await prisma.comment.create({
        data: {
          discussionId: input.discussionId,
          workspaceId: discussion.workspaceId,
          authorId: userId,
          parentCommentId: input.parentCommentId,
          depth,
          body: input.body,
        },
        select: {
          id: true,
          discussionId: true,
          parentCommentId: true,
          depth: true,
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

      await invalidateCommentCaches(input.discussionId, comment.id);
      await recordCommentOperation({
        requestId: context.requestId,
        actorUserId: userId,
        workspaceId: discussion.workspaceId,
        discussionId: input.discussionId,
        commentId: comment.id,
        action: "create",
        timestamp: new Date().toISOString(),
      });
      await recordCommentAudit({
        requestId: context.requestId,
        actorUserId: userId,
        workspaceId: discussion.workspaceId,
        discussionId: input.discussionId,
        commentId: comment.id,
        parentCommentId: input.parentCommentId ?? null,
        action: "create",
        timestamp: new Date().toISOString(),
      });
      try {
        await notificationService.enqueueCommentCreated({
          requestId: context.requestId,
          actorUserId: userId,
          workspaceId: discussion.workspaceId,
          discussionId: comment.discussionId,
          commentId: comment.id,
          body: comment.body,
          parentCommentId: comment.parentCommentId,
        });
      } catch (error) {
        // Comment creation should succeed even if async notification enqueue fails.
        console.error(
          JSON.stringify({
            level: "ERROR",
            event: "notification.enqueue.failed",
            requestId: context.requestId,
            workspaceId: discussion.workspaceId,
            discussionId: comment.discussionId,
            commentId: comment.id,
            error: String(error),
            timestamp: new Date().toISOString(),
          }),
        );
      }

      if (idempotencyResultKey) {
        await redisCache.setJSON(
          idempotencyResultKey,
          {
            commentId: comment.id,
            workspaceId: discussion.workspaceId,
          } satisfies CreateIdempotencyResult,
          COMMENT_CREATE_IDEMPOTENCY_TTL_SECONDS,
        );
      }

      return comment;
    } finally {
      if (idempotencyLockKey) {
        await redis.del(idempotencyLockKey);
      }
    }
  },

  async listByDiscussion(
    userId: string,
    input: ListCommentsInput,
    context: RequestContext,
  ): Promise<PaginatedResult<PublicComment>> {
    const discussion = await getDiscussionScope(input.discussionId);
    await requireWorkspaceAction(
      discussion.workspaceId,
      userId,
      WORKSPACE_ACTIONS.READ_DISCUSSION,
      context.requestId,
    );

    if (input.parentCommentId) {
      await validateParentComment(input.discussionId, input.parentCommentId);
    }

    const cacheKey = discussionCommentListKey(
      input.discussionId,
      input.parentCommentId,
      input.cursor,
      input.take,
    );
    const cached = await redisCache.getJSON<PaginatedResult<PublicComment>>(cacheKey);
    if (cached) {
      await recordCommentOperation({
        requestId: context.requestId,
        actorUserId: userId,
        workspaceId: discussion.workspaceId,
        discussionId: input.discussionId,
        commentId: input.parentCommentId ?? null,
        action: "list",
        timestamp: new Date().toISOString(),
      });
      await recordCommentAudit({
        requestId: context.requestId,
        actorUserId: userId,
        workspaceId: discussion.workspaceId,
        discussionId: input.discussionId,
        commentId: input.parentCommentId ?? null,
        parentCommentId: input.parentCommentId ?? null,
        action: "list",
        timestamp: new Date().toISOString(),
      });
      return cached;
    }

    const rows = await prisma.comment.findMany({
      where: {
        discussionId: input.discussionId,
        parentCommentId: input.parentCommentId ?? null,
      },
      take: input.take + 1,
      skip: input.cursor ? 1 : 0,
      cursor: input.cursor ? { id: input.cursor } : undefined,
      orderBy: {
        id: "desc",
      },
      select: {
        id: true,
        discussionId: true,
        parentCommentId: true,
        depth: true,
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

    const paginated = toPaginatedResult(rows, input.take);
    await redisCache.setJSON(cacheKey, paginated, COMMENT_LIST_TTL_SECONDS);
    await recordCommentOperation({
      requestId: context.requestId,
      actorUserId: userId,
      workspaceId: discussion.workspaceId,
      discussionId: input.discussionId,
      commentId: input.parentCommentId ?? null,
      action: "list",
      timestamp: new Date().toISOString(),
    });
    await recordCommentAudit({
      requestId: context.requestId,
      actorUserId: userId,
      workspaceId: discussion.workspaceId,
      discussionId: input.discussionId,
      commentId: input.parentCommentId ?? null,
      parentCommentId: input.parentCommentId ?? null,
      action: "list",
      timestamp: new Date().toISOString(),
    });

    return paginated;
  },

  async getById(
    userId: string,
    commentId: string,
    context: RequestContext,
  ): Promise<PublicComment> {
    const cacheKey = commentByIdKey(commentId);
    const cached = await redisCache.getJSON<CommentWithWorkspace>(
      cacheKey,
    );
    if (cached) {
      try {
        await requireWorkspaceAction(
          cached.workspaceId,
          userId,
          WORKSPACE_ACTIONS.READ_DISCUSSION,
          context.requestId,
        );
      } catch (error) {
        normalizeForeignTenantDeniedAsNotFound(error);
      }

      return toPublicComment(cached);
    }

    const comment = await getCommentByIdWithWorkspace(commentId);

    if (!comment) {
      throw new AppError("NOT_FOUND", "Comment not found.");
    }

    try {
      await requireWorkspaceAction(
        comment.workspaceId,
        userId,
        WORKSPACE_ACTIONS.READ_DISCUSSION,
        context.requestId,
      );
    } catch (error) {
      normalizeForeignTenantDeniedAsNotFound(error);
    }

    await redisCache.setJSON(cacheKey, comment, COMMENT_TTL_SECONDS);
    return toPublicComment(comment);
  },

  async remove(
    userId: string,
    input: DeleteCommentInput,
    context: RequestContext,
  ): Promise<{ success: true }> {
    const comment = await prisma.comment.findUnique({
      where: { id: input.commentId },
      select: {
        id: true,
        discussionId: true,
        workspaceId: true,
        authorId: true,
        parentCommentId: true,
      },
    });

    if (!comment) {
      throw new AppError("NOT_FOUND", "Comment not found.");
    }

    let role: Awaited<ReturnType<typeof requireWorkspaceAction>>;
    try {
      role = await requireWorkspaceAction(
        comment.workspaceId,
        userId,
        WORKSPACE_ACTIONS.DELETE_COMMENT,
        context.requestId,
      );
    } catch (error) {
      normalizeForeignTenantDeniedAsNotFound(error);
    }

    const canManageAnyComment = canPerformWorkspaceAction(
      role,
      WORKSPACE_ACTIONS.MANAGE_COMMENT,
    );

    if (comment.authorId !== userId && !canManageAnyComment) {
      await recordCommentPermissionDenied({
        requestId: context.requestId,
        userId,
        workspaceId: comment.workspaceId,
        action: "delete_comment",
        reason: "not_author_or_manager",
        timestamp: new Date().toISOString(),
      });
      throw new AppError(
        "FORBIDDEN",
        "Only comment author, admin, or owner can delete this comment.",
      );
    }

    await prisma.comment.delete({
      where: { id: input.commentId },
    });

    await invalidateCommentCaches(comment.discussionId, comment.id);
    await recordCommentOperation({
      requestId: context.requestId,
      actorUserId: userId,
      workspaceId: comment.workspaceId,
      discussionId: comment.discussionId,
      commentId: comment.id,
      action: "delete",
      timestamp: new Date().toISOString(),
    });
    await recordCommentAudit({
      requestId: context.requestId,
      actorUserId: userId,
      workspaceId: comment.workspaceId,
      discussionId: comment.discussionId,
      commentId: comment.id,
      parentCommentId: comment.parentCommentId,
      action: "delete",
      timestamp: new Date().toISOString(),
    });

    return { success: true as const };
  },

  async update(
    userId: string,
    input: UpdateCommentInput,
    context: RequestContext,
  ): Promise<PublicComment> {
    const comment = await prisma.comment.findUnique({
      where: { id: input.commentId },
      select: {
        id: true,
        discussionId: true,
        workspaceId: true,
        authorId: true,
        parentCommentId: true,
      },
    });

    if (!comment) {
      throw new AppError("NOT_FOUND", "Comment not found.");
    }

    let role: Awaited<ReturnType<typeof requireWorkspaceAction>>;
    try {
      role = await requireWorkspaceAction(
        comment.workspaceId,
        userId,
        WORKSPACE_ACTIONS.CREATE_COMMENT,
        context.requestId,
      );
    } catch (error) {
      normalizeForeignTenantDeniedAsNotFound(error);
    }

    const canManageAnyComment = canPerformWorkspaceAction(
      role,
      WORKSPACE_ACTIONS.MANAGE_COMMENT,
    );

    if (comment.authorId !== userId && !canManageAnyComment) {
      await recordCommentPermissionDenied({
        requestId: context.requestId,
        userId,
        workspaceId: comment.workspaceId,
        action: "update_comment",
        reason: "not_author_or_manager",
        timestamp: new Date().toISOString(),
      });
      throw new AppError(
        "FORBIDDEN",
        "Only comment author, admin, or owner can update this comment.",
      );
    }

    const updated = await prisma.comment.update({
      where: { id: input.commentId },
      data: {
        body: input.body,
      },
      select: {
        id: true,
        discussionId: true,
        parentCommentId: true,
        depth: true,
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

    await invalidateCommentCaches(comment.discussionId, comment.id);
    await recordCommentOperation({
      requestId: context.requestId,
      actorUserId: userId,
      workspaceId: comment.workspaceId,
      discussionId: comment.discussionId,
      commentId: comment.id,
      action: "update",
      timestamp: new Date().toISOString(),
    });
    await recordCommentAudit({
      requestId: context.requestId,
      actorUserId: userId,
      workspaceId: comment.workspaceId,
      discussionId: comment.discussionId,
      commentId: comment.id,
      parentCommentId: comment.parentCommentId,
      action: "update",
      timestamp: new Date().toISOString(),
    });

    return updated;
  },
};
