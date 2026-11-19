import {
  listNotificationsInputSchema,
  markAllNotificationsReadInputSchema,
  markNotificationReadInputSchema,
} from "@repo/validators/notification";

import { execute } from "../../errors/app-error";
import { createRateLimitGuard } from "../../middleware/rateLimit";
import { notificationService } from "../../services/notification.service";
import { createTRPCRouter, protectedProcedure } from "../trpc";

const listNotificationsRateLimit = createRateLimitGuard({
  routeKey: "notification.listForUser",
  limit: 120,
  windowSeconds: 60,
});

const markReadRateLimit = createRateLimitGuard({
  routeKey: "notification.markAsRead",
  limit: 120,
  windowSeconds: 60,
});

const markAllReadRateLimit = createRateLimitGuard({
  routeKey: "notification.markAllAsRead",
  limit: 40,
  windowSeconds: 60,
});

const listNotificationsProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  await listNotificationsRateLimit(ctx.user.id, ctx.requestId);
  return next();
});

const markReadProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  await markReadRateLimit(ctx.user.id, ctx.requestId);
  return next();
});

const markAllReadProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  await markAllReadRateLimit(ctx.user.id, ctx.requestId);
  return next();
});

export const notificationRouter = createTRPCRouter({
  listForUser: listNotificationsProcedure
    .input(listNotificationsInputSchema)
    .query(({ ctx, input }) =>
      execute(() =>
        notificationService.listForUser(ctx.user.id, input, {
          requestId: ctx.requestId,
        }),
      ),
    ),

  markAsRead: markReadProcedure.input(markNotificationReadInputSchema).mutation(({ ctx, input }) =>
    execute(() =>
      notificationService.markAsRead(ctx.user.id, input, {
        requestId: ctx.requestId,
      }),
    ),
  ),

  markAllAsRead: markAllReadProcedure
    .input(markAllNotificationsReadInputSchema)
    .mutation(({ ctx, input }) =>
      execute(() =>
        notificationService.markAllAsRead(ctx.user.id, input, {
          requestId: ctx.requestId,
        }),
      ),
    ),
});
