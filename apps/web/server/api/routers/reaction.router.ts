import { discussionReactionsInputSchema, setReactionInputSchema } from "@repo/validators/discussion";

import { execute } from "../../errors/app-error";
import { createRateLimitGuard } from "../../middleware/rateLimit";
import { reactionService } from "../../services/reaction.service";
import { createTRPCRouter, protectedProcedure } from "../trpc";

function limited(routeKey: string, limit: number) {
  const guard = createRateLimitGuard({ routeKey, limit, windowSeconds: 60 });
  return protectedProcedure.use(async ({ ctx, next }) => {
    await guard(ctx.user.id, ctx.requestId);
    return next();
  });
}

export const reactionRouter = createTRPCRouter({
  forDiscussion: limited("reaction.forDiscussion", 120).input(discussionReactionsInputSchema).query(({ ctx, input }) =>
    execute(() => reactionService.forDiscussion(ctx.user.id, input)),
  ),
  set: limited("reaction.set", 120).input(setReactionInputSchema).mutation(({ ctx, input }) =>
    execute(() => reactionService.set(ctx.user.id, input)),
  ),
});
