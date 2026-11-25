import { createInviteInputSchema, inviteByTokenInputSchema, listInvitesInputSchema, revokeInviteInputSchema } from "@repo/validators/workspace";

import { AppError, execute } from "../../errors/app-error";
import { createRateLimitGuard, createRateLimitGuardByKey } from "../../middleware/rateLimit";
import { recordInviteLookupFailure } from "../../observability/security-events";
import { inviteService } from "../../services/invite.service";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";

function limited(routeKey: string, limit: number) {
  const guard = createRateLimitGuard({ routeKey, limit, windowSeconds: 60 });
  return protectedProcedure.use(async ({ ctx, next }) => {
    await guard(ctx.user.id, ctx.requestId);
    return next();
  });
}

// Invite links PRD, NFR-2: looking up tokens is limited per IP, joining per user.
const describeByIp = createRateLimitGuardByKey({ routeKey: "invite.describe", limit: 30, windowSeconds: 60 });

async function recordingFailure<T>(operation: () => Promise<T>, failure: Parameters<typeof recordInviteLookupFailure>[0]) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") await recordInviteLookupFailure(failure);
    throw error;
  }
}

export const inviteRouter = createTRPCRouter({
  create: limited("invite.create", 20).input(createInviteInputSchema).mutation(({ ctx, input }) =>
    execute(() => inviteService.create(ctx.user.id, input, { requestId: ctx.requestId })),
  ),
  list: limited("invite.list", 60).input(listInvitesInputSchema).query(({ ctx, input }) =>
    execute(() => inviteService.list(ctx.user.id, input, { requestId: ctx.requestId })),
  ),
  revoke: limited("invite.revoke", 30).input(revokeInviteInputSchema).mutation(({ ctx, input }) =>
    execute(() => inviteService.revoke(ctx.user.id, input, { requestId: ctx.requestId })),
  ),
  // Public: the join page shows where a link leads before anyone signs in.
  describe: publicProcedure.input(inviteByTokenInputSchema).query(async ({ ctx, input }) => {
    await describeByIp(ctx.ip ?? "unknown", ctx.requestId);
    return execute(() => recordingFailure(
      () => inviteService.describe(input.token, ctx.user?.id ?? null),
      { requestId: ctx.requestId, timestamp: new Date().toISOString(), userId: ctx.user?.id ?? null, ip: ctx.ip, action: "describe" },
    ));
  }),
  join: limited("invite.join", 10).input(inviteByTokenInputSchema).mutation(({ ctx, input }) =>
    execute(() => recordingFailure(
      () => inviteService.join(ctx.user.id, input.token, { requestId: ctx.requestId }),
      { requestId: ctx.requestId, timestamp: new Date().toISOString(), userId: ctx.user.id, ip: ctx.ip, action: "join" },
    )),
  ),
});
