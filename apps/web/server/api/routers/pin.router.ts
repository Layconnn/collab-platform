import { pinnedRepliesInputSchema, setPinnedReplyInputSchema } from "@repo/validators/discussion";

import { execute } from "../../errors/app-error";
import { createRateLimitGuard } from "../../middleware/rateLimit";
import { pinService } from "../../services/pin.service";
import { createTRPCRouter, protectedProcedure } from "../trpc";

function limited(routeKey: string, limit: number) {
  const guard = createRateLimitGuard({ routeKey, limit, windowSeconds: 60 });
  return protectedProcedure.use(async ({ ctx, next }) => {
    await guard(ctx.user.id, ctx.requestId);
    return next();
  });
}

export const pinRouter = createTRPCRouter({
  list: limited("pin.list", 120).input(pinnedRepliesInputSchema).query(({ ctx, input }) =>
    execute(() => pinService.list(ctx.user.id, input)),
  ),
  set: limited("pin.set", 30).input(setPinnedReplyInputSchema).mutation(({ ctx, input }) =>
    execute(() => pinService.set(ctx.user.id, input)),
  ),
});
