import {
  createDiscussionInputSchema,
  deleteDiscussionInputSchema,
  getDiscussionByIdInputSchema,
  listDiscussionsInputSchema,
  updateDiscussionInputSchema,
} from "@repo/validators/discussion";

import { redis } from "../../cache/redis";
import { toTRPCError } from "../../errors/app-error";
import { createRateLimitGuard } from "../../middleware/rateLimit";
import { discussionService } from "../../services/discussion.service";
import { createTRPCRouter, protectedProcedure } from "../trpc";

const execute = async <T>(operation: () => Promise<T>) => {
  try {
    return await operation();
  } catch (error) {
    throw toTRPCError(error);
  }
};

const createDiscussionRateLimit = createRateLimitGuard({
  routeKey: "discussion.create",
  limit: 30,
  windowSeconds: 60,
});

const getDiscussionRateLimit = createRateLimitGuard({
  routeKey: "discussion.getById",
  limit: 120,
  windowSeconds: 60,
});

const updateDiscussionRateLimit = createRateLimitGuard({
  routeKey: "discussion.update",
  limit: 40,
  windowSeconds: 60,
});

const deleteDiscussionRateLimit = createRateLimitGuard({
  routeKey: "discussion.delete",
  limit: 20,
  windowSeconds: 60,
});

const listDiscussionRateLimit = createRateLimitGuard({
  routeKey: "discussion.listByWorkspace",
  limit: 80,
  windowSeconds: 60,
});

const listDiscussionStrictRateLimit = createRateLimitGuard({
  routeKey: "discussion.listByWorkspace.strict",
  limit: 25,
  windowSeconds: 60,
});

const createDiscussionProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  await createDiscussionRateLimit(ctx.user.id, ctx.requestId);
  return next();
});

const getDiscussionProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  await getDiscussionRateLimit(ctx.user.id, ctx.requestId);
  return next();
});

const updateDiscussionProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  await updateDiscussionRateLimit(ctx.user.id, ctx.requestId);
  return next();
});

const deleteDiscussionProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  await deleteDiscussionRateLimit(ctx.user.id, ctx.requestId);
  return next();
});

const listDiscussionProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  let deniedCount = 0;
  try {
    const deniedRaw = await redis.get(`security:permission_denied:user:${ctx.user.id}`);
    deniedCount = Number(deniedRaw ?? "0");
  } catch {
    deniedCount = 0;
  }
  if (Number.isFinite(deniedCount) && deniedCount >= 5) {
    await listDiscussionStrictRateLimit(ctx.user.id, ctx.requestId);
  } else {
    await listDiscussionRateLimit(ctx.user.id, ctx.requestId);
  }
  return next();
});

export const discussionRouter = createTRPCRouter({
  create: createDiscussionProcedure.input(createDiscussionInputSchema).mutation(({ ctx, input }) =>
    execute(() =>
      discussionService.create(ctx.user.id, input, { requestId: ctx.requestId }),
    ),
  ),

  listByWorkspace: listDiscussionProcedure.input(listDiscussionsInputSchema).query(({ ctx, input }) =>
    execute(() =>
      discussionService.listByWorkspace(ctx.user.id, input, { requestId: ctx.requestId }),
    ),
  ),

  getById: getDiscussionProcedure.input(getDiscussionByIdInputSchema).query(({ ctx, input }) =>
    execute(() =>
      discussionService.getById(ctx.user.id, input, { requestId: ctx.requestId }),
    ),
  ),

  update: updateDiscussionProcedure.input(updateDiscussionInputSchema).mutation(({ ctx, input }) =>
    execute(() =>
      discussionService.update(ctx.user.id, input, { requestId: ctx.requestId }),
    ),
  ),

  remove: deleteDiscussionProcedure.input(deleteDiscussionInputSchema).mutation(({ ctx, input }) =>
    execute(() =>
      discussionService.remove(ctx.user.id, input, { requestId: ctx.requestId }),
    ),
  ),
});
