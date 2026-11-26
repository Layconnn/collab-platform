import type {
  CreateDiscussionInput,
  DeleteDiscussionInput,
  GetDiscussionByIdInput,
  ListDiscussionsInput,
  UpdateDiscussionInput,
  DiscussionContextInput,
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
import { activityActorLabel, recordActivity } from "./activity.service";
import { attachmentService, attachmentsSelect, newUploadIds, type PublicAttachment } from "./files/attachment.service";
import { followOnParticipation } from "./follow.service";
import { notificationService } from "./notification.service";
import { toPaginatedResult, type PaginatedResult } from "../../src/common/utils/pagination";
import {
  buildHistory,
  discussionEditChanges,
  HISTORY_MAX_VERSIONS,
  keepDiscussionRevision,
  lockDiscussionVersion,
} from "./revision.service";
import { requireWorkspaceAction as requireMemberAction } from "./workspace.access";
import {
  WORKSPACE_ACTIONS,
  canPerformWorkspaceAction,
  type WorkspaceAction,
} from "./workspace.permissions";

const DISCUSSION_TTL_SECONDS = 120;
const DISCUSSION_LIST_TTL_SECONDS = 60;
const DISCUSSION_CREATE_IDEMPOTENCY_TTL_SECONDS = 60 * 60;

type RequestContext = {
  requestId: string;
};

function discussionByIdKey(discussionId: string): string {
  return `discussion:v3:${discussionId}`;
}

function workspaceDiscussionListKey(
  workspaceId: string,
  cursor: string | undefined,
  take: number,
): string {
  return `workspace:${workspaceId}:discussions:v3:${cursor ?? "start"}:${take}`;
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

type ListedDiscussion = {
  id: string;
  workspaceId: string;
  title: string;
  author: { id: string; name: string | null; username: string };
  files: number;
  createdAt: Date;
  updatedAt: Date;
};

type Participant = { id: string; name: string | null; username: string };

// What each row of the discussions list shows beyond the cached page
// (dashboard redesign, #170): replies, when the last one came, who else took
// part and whether the discussion led to a decision. Read fresh on every
// request, so replies and decisions never wait for the list cache.
const PARTICIPANTS_SHOWN = 3;

async function withActivity(workspaceId: string, items: ListedDiscussion[]) {
  if (!items.length) return [];
  const ids = items.map((item) => item.id);
  const [byAuthor, decisions] = await Promise.all([
    prisma.comment.groupBy({
      by: ["discussionId", "authorId"],
      where: { workspaceId, discussionId: { in: ids } },
      _count: { _all: true },
      _max: { createdAt: true },
    }),
    prisma.decision.findMany({
      where: { workspaceId, sourceWorkspaceId: workspaceId, sourceDiscussionId: { in: ids }, deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, sourceDiscussionId: true },
    }),
  ]);
  const people = await prisma.user.findMany({
    where: { id: { in: [...new Set(byAuthor.map((row) => row.authorId))] } },
    select: { id: true, name: true, username: true },
  });
  const person = new Map<string, Participant>(people.map((user) => [user.id, user]));

  return items.map((item) => {
    const rows = byAuthor
      .filter((row) => row.discussionId === item.id)
      .sort((a, b) => (b._max.createdAt?.getTime() ?? 0) - (a._max.createdAt?.getTime() ?? 0));
    const lastReplyAt = rows[0]?._max.createdAt ?? null;
    const participants = rows
      .filter((row) => row.authorId !== item.author.id)
      .map((row) => person.get(row.authorId))
      .filter((user): user is Participant => Boolean(user))
      .slice(0, PARTICIPANTS_SHOWN);
    // The newest decision from the discussion says where it stands.
    const decision = decisions.find((row) => row.sourceDiscussionId === item.id);
    return {
      ...item,
      replies: rows.reduce((total, row) => total + row._count._all, 0),
      lastReplyAt,
      participants,
      decision: decision ? { id: decision.id, status: decision.status } : null,
    };
  });
}

// The side panel lists the author and then the most recent repliers.
const CONTEXT_PEOPLE = 8;

const requireWorkspaceAction = (
  workspaceId: string,
  userId: string,
  action: WorkspaceAction,
  requestId: string,
) => requireMemberAction(workspaceId, userId, action, requestId, recordDiscussionPermissionDenied);

export const discussionService = {
  // Every version of the title and context, newest first (edit history PRD,
  // FR-4, FR-5). Read fresh; members of the workspace only.
  async history(userId: string, input: GetDiscussionByIdInput, context: RequestContext) {
    const discussion = await prisma.discussion.findUnique({
      where: { id: input.discussionId },
      select: {
        workspaceId: true,
        title: true,
        body: true,
        editCount: true,
        createdAt: true,
        author: { select: { name: true, username: true } },
        attachments: { select: { fileName: true }, orderBy: { position: "asc" } },
      },
    });
    if (!discussion) {
      throw new AppError("NOT_FOUND", "Discussion not found.");
    }
    await requireWorkspaceAction(discussion.workspaceId, userId, WORKSPACE_ACTIONS.READ_DISCUSSION, context.requestId);
    const revisions = await prisma.discussionRevision.findMany({
      where: { discussionId: input.discussionId },
      orderBy: { version: "desc" },
      take: HISTORY_MAX_VERSIONS,
      select: { version: true, title: true, body: true, fileNames: true, editorLabel: true, createdAt: true },
    });
    return buildHistory({
      current: { title: discussion.title, body: discussion.body, fileNames: discussion.attachments.map((file) => file.fileName), editCount: discussion.editCount },
      author: { label: activityActorLabel(discussion.author), at: discussion.createdAt },
      revisions,
    });
  },

  // What the discussion page's side panel shows (dashboard redesign, #171):
  // who took part and how much, and the decisions that came from it. Read
  // fresh, never cached, so a new reply or decision shows at once.
  async context(userId: string, input: DiscussionContextInput, context: RequestContext) {
    await requireWorkspaceAction(input.workspaceId, userId, WORKSPACE_ACTIONS.READ_DISCUSSION, context.requestId);
    const discussion = await prisma.discussion.findFirst({
      where: { id: input.discussionId, workspaceId: input.workspaceId },
      select: { authorId: true },
    });
    if (!discussion) throw new AppError("NOT_FOUND", "Discussion not found.");

    const [byAuthor, decisions] = await Promise.all([
      prisma.comment.groupBy({
        by: ["authorId"],
        where: { workspaceId: input.workspaceId, discussionId: input.discussionId },
        _count: { _all: true },
        _max: { createdAt: true },
      }),
      prisma.decision.findMany({
        where: { workspaceId: input.workspaceId, sourceWorkspaceId: input.workspaceId, sourceDiscussionId: input.discussionId, deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, question: true, status: true, createdAt: true },
      }),
    ]);
    const repliers = [...byAuthor]
      .filter((row) => row.authorId !== discussion.authorId)
      .sort((a, b) => (b._max.createdAt?.getTime() ?? 0) - (a._max.createdAt?.getTime() ?? 0));
    const shown = repliers.slice(0, CONTEXT_PEOPLE - 1);
    const users = await prisma.user.findMany({
      where: { id: { in: [discussion.authorId, ...shown.map((row) => row.authorId)] } },
      select: { id: true, name: true, username: true },
    });
    const byId = new Map(users.map((user) => [user.id, user]));
    const authorReplies = byAuthor.find((row) => row.authorId === discussion.authorId)?._count._all ?? 0;
    const people = [
      ...(byId.has(discussion.authorId) ? [{ ...byId.get(discussion.authorId)!, author: true, replies: authorReplies }] : []),
      ...shown.flatMap((row) => {
        const user = byId.get(row.authorId);
        return user ? [{ ...user, author: false, replies: row._count._all }] : [];
      }),
    ];
    return {
      replies: byAuthor.reduce((total, row) => total + row._count._all, 0),
      people,
      morePeople: repliers.length - shown.length,
      decisions,
    };
  },

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
        author: { id: string; name: string | null; username?: string };
        attachments?: PublicAttachment[];
        createdAt: Date;
        updatedAt: Date;
      }>(idempotencyResultKey);
      if (cachedResult) {
        if (!cachedResult.author.username) {
          const current = await prisma.discussion.findUnique({
            where: { id: cachedResult.id },
            select: { author: { select: { username: true } } },
          });
          if (current) {
            return {
              ...cachedResult,
              author: { ...cachedResult.author, username: current.author.username },
            };
          }
        }
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
      const attachmentIds = await attachmentService.verifyUploads(userId, input.workspaceId, input.attachmentIds ?? []);
      const discussion = await prisma.$transaction(async (tx) => {
        const draft = await tx.discussion.create({
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
            attachments: attachmentsSelect,
            author: {
              select: {
                id: true,
                name: true,
                username: true,
              },
            },
            createdAt: true,
            updatedAt: true,
            editCount: true,
          },
        });
        await attachmentService.attach(tx, { userId, workspaceId: input.workspaceId, attachmentIds, target: { discussionId: draft.id } });
        const created = attachmentIds.length
          ? { ...draft, attachments: await tx.attachment.findMany({ where: { discussionId: draft.id }, ...attachmentsSelect }) }
          : draft;
        await followOnParticipation(tx, { workspaceId: input.workspaceId, discussionId: created.id, userId });
        await recordActivity(tx, {
          workspaceId: created.workspaceId,
          actorUserId: userId,
          actorLabel: activityActorLabel(created.author),
          kind: "DISCUSSION_CREATED",
          subjectType: "DISCUSSION",
          subjectId: created.id,
          summary: { title: created.title, ...(attachmentIds.length ? { files: attachmentIds.length } : {}) },
        });
        return created;
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
      try {
        await notificationService.enqueueDiscussionCreated({
          requestId: context.requestId,
          actorUserId: userId,
          workspaceId: discussion.workspaceId,
          discussionId: discussion.id,
          title: discussion.title,
          body: discussion.body,
        });
      } catch (error) {
        // Discussion creation should succeed even if async notification enqueue fails.
        console.error(
          JSON.stringify({
            level: "ERROR",
            event: "notification.enqueue.failed",
            requestId: context.requestId,
            workspaceId: discussion.workspaceId,
            discussionId: discussion.id,
            error: String(error),
            timestamp: new Date().toISOString(),
          }),
        );
      }

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
    const cached = await redisCache.getJSON<PaginatedResult<ListedDiscussion>>(cacheKey);
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
      // Dates come back from the cache as strings.
      return { ...cached, items: await withActivity(input.workspaceId, cached.items.map((item) => ({ ...item, createdAt: new Date(item.createdAt), updatedAt: new Date(item.updatedAt) }))) };
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
            username: true,
          },
        },
        _count: { select: { attachments: true } },
        createdAt: true,
        updatedAt: true,
      },
    });

    const paginated = toPaginatedResult(rows.map(({ _count, ...row }) => ({ ...row, files: _count.attachments })), input.take);
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

    return { ...paginated, items: await withActivity(input.workspaceId, paginated.items) };
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
        username: string;
      };
      attachments: PublicAttachment[];
      createdAt: Date;
      updatedAt: Date;
      // Absent in entries cached before edit history shipped.
      editCount?: number;
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
        attachments: attachmentsSelect,
        author: {
          select: {
            id: true,
            name: true,
            username: true,
          },
        },
        createdAt: true,
        updatedAt: true,
        editCount: true,
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
        title: true,
        body: true,
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
      const target = { discussionId: discussion.id };
      if (input.attachmentIds) {
        await attachmentService.verifyUploads(userId, discussion.workspaceId, await newUploadIds(target, input.attachmentIds));
      }
      const updated = await prisma.$transaction(async (tx) => {
        const before = await lockDiscussionVersion(tx, discussion.id);
        const files = input.attachmentIds
          ? await attachmentService.sync(tx, { userId, workspaceId: discussion.workspaceId, target, desired: input.attachmentIds })
          : null;
        const edited = await discussionEditChanges(tx, before, {
          discussionId: discussion.id, title: input.title ?? before.title, body: input.body ?? before.body, filesSynced: Boolean(files),
        });
        if (edited) {
          await keepDiscussionRevision(tx, { workspaceId: discussion.workspaceId, discussionId: discussion.id, editorId: userId, before });
        }
        const changed = await tx.discussion.update({
          where: { id: input.discussionId },
          data: {
            title: input.title,
            body: input.body,
            ...(edited ? { editCount: { increment: 1 } } : {}),
          },
          select: {
            id: true,
            workspaceId: true,
            title: true,
            body: true,
            attachments: attachmentsSelect,
            author: {
              select: {
                id: true,
                name: true,
                username: true,
              },
            },
            createdAt: true,
            updatedAt: true,
            editCount: true,
          },
        });
        await recordActivity(tx, {
          workspaceId: changed.workspaceId,
          actorUserId: userId,
          kind: "DISCUSSION_UPDATED",
          subjectType: "DISCUSSION",
          subjectId: changed.id,
          summary: { title: changed.title, ...(files && (files.added || files.removed) ? { filesAdded: files.added, filesRemoved: files.removed } : {}) },
        });
        return changed;
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

      try {
        await notificationService.enqueueNewMentionsFromEdit({
          requestId: context.requestId,
          actorUserId: userId,
          resource: { workspaceId: updated.workspaceId, discussionId: updated.id, commentId: null },
          previousText: `${discussion.title} ${discussion.body}`,
          updatedText: `${updated.title} ${updated.body}`,
          updatedAt: updated.updatedAt,
        });
      } catch (error) {
        console.error(JSON.stringify({ level: "ERROR", event: "notification.enqueue.failed", requestId: context.requestId, discussionId: updated.id, error: String(error) }));
      }

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
        title: true,
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

    await prisma.$transaction(async (tx) => {
      await tx.discussion.delete({
        where: { id: input.discussionId },
      });
      await recordActivity(tx, {
        workspaceId: discussion.workspaceId,
        actorUserId: userId,
        kind: "DISCUSSION_DELETED",
        subjectType: "DISCUSSION",
        subjectId: discussion.id,
        summary: { title: discussion.title },
      });
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
