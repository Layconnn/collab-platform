import {
  createCommentInputSchema,
  deleteCommentInputSchema,
  getCommentByIdInputSchema,
  listCommentsInputSchema,
  updateCommentInputSchema,
} from "@repo/validators/comment";

import { redis } from "../../cache/redis";
import { toTRPCError } from "../../errors/app-error";
import { createRateLimitGuard } from "../../middleware/rateLimit";
import { commentService } from "../../services/comment.service";
import { createTRPCRouter, protectedProcedure } from "../trpc";

const execute = async <T>(operation: () => Promise<T>) => {
  try {
    return await operation();
  } catch (error) {
    throw toTRPCError(error);
  }
};

const createCommentRateLimit = createRateLimitGuard({
  routeKey: "comment.create",
  limit: 40,
  windowSeconds: 60,
});

const deleteCommentRateLimit = createRateLimitGuard({
  routeKey: "comment.delete",
  limit: 30,
  windowSeconds: 60,
});

const deleteCommentStrictRateLimit = createRateLimitGuard({
  routeKey: "comment.delete.strict",
  limit: 10,
  windowSeconds: 60,
});

const updateCommentRateLimit = createRateLimitGuard({
  routeKey: "comment.update",
  limit: 50,
  windowSeconds: 60,
});

const updateCommentStrictRateLimit = createRateLimitGuard({
  routeKey: "comment.update.strict",
  limit: 20,
  windowSeconds: 60,
});

const listCommentRateLimit = createRateLimitGuard({
  routeKey: "comment.listByDiscussion",
  limit: 120,
  windowSeconds: 60,
});

const listCommentStrictRateLimit = createRateLimitGuard({
  routeKey: "comment.listByDiscussion.strict",
  limit: 40,
  windowSeconds: 60,
});

const getCommentRateLimit = createRateLimitGuard({
  routeKey: "comment.getById",
  limit: 120,
  windowSeconds: 60,
});

const getCommentStrictRateLimit = createRateLimitGuard({
  routeKey: "comment.getById.strict",
  limit: 40,
  windowSeconds: 60,
});

async function getCommentDeniedCount(userId: string): Promise<number> {
  try {
    const deniedRaw = await redis.get(`security:comment_permission_denied:user:${userId}`);
    return Number(deniedRaw ?? "0");
  } catch {
    return 0;
  }
}

async function applyAdaptiveCommentRateLimit(params: {
  userId: string;
  requestId: string;
  base: ReturnType<typeof createRateLimitGuard>;
  strict: ReturnType<typeof createRateLimitGuard>;
}): Promise<void> {
  const deniedCount = await getCommentDeniedCount(params.userId);
  if (Number.isFinite(deniedCount) && deniedCount >= 5) {
    await params.strict(params.userId, params.requestId);
    return;
  }
  await params.base(params.userId, params.requestId);
}

const createCommentProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  await createCommentRateLimit(ctx.user.id, ctx.requestId);
  return next();
});

const deleteCommentProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  await applyAdaptiveCommentRateLimit({
    userId: ctx.user.id,
    requestId: ctx.requestId,
    base: deleteCommentRateLimit,
    strict: deleteCommentStrictRateLimit,
  });
  return next();
});

const updateCommentProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  await applyAdaptiveCommentRateLimit({
    userId: ctx.user.id,
    requestId: ctx.requestId,
    base: updateCommentRateLimit,
    strict: updateCommentStrictRateLimit,
  });
  return next();
});

const listCommentProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const deniedCount = await getCommentDeniedCount(ctx.user.id);

  if (Number.isFinite(deniedCount) && deniedCount >= 5) {
    await listCommentStrictRateLimit(ctx.user.id, ctx.requestId);
  } else {
    await listCommentRateLimit(ctx.user.id, ctx.requestId);
  }

  return next();
});

const getCommentProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  await applyAdaptiveCommentRateLimit({
    userId: ctx.user.id,
    requestId: ctx.requestId,
    base: getCommentRateLimit,
    strict: getCommentStrictRateLimit,
  });
  return next();
});

export const commentRouter = createTRPCRouter({
  create: createCommentProcedure.input(createCommentInputSchema).mutation(({ ctx, input }) =>
    execute(() =>
      commentService.create(ctx.user.id, input, { requestId: ctx.requestId }),
    ),
  ),

  listByDiscussion: listCommentProcedure.input(listCommentsInputSchema).query(({ ctx, input }) =>
    execute(() =>
      commentService.listByDiscussion(ctx.user.id, input, {
        requestId: ctx.requestId,
      }),
    ),
  ),

  getById: getCommentProcedure.input(getCommentByIdInputSchema).query(({ ctx, input }) =>
    execute(() =>
      commentService.getById(ctx.user.id, input.commentId, {
        requestId: ctx.requestId,
      }),
    ),
  ),

  update: updateCommentProcedure.input(updateCommentInputSchema).mutation(({ ctx, input }) =>
    execute(() =>
      commentService.update(ctx.user.id, input, { requestId: ctx.requestId }),
    ),
  ),

  remove: deleteCommentProcedure.input(deleteCommentInputSchema).mutation(({ ctx, input }) =>
    execute(() =>
      commentService.remove(ctx.user.id, input, { requestId: ctx.requestId }),
    ),
  ),
});
