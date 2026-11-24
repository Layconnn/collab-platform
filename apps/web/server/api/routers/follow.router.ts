import { discussionFollowInputSchema, setDiscussionFollowInputSchema } from "@repo/validators/discussion";

import { execute } from "../../errors/app-error";
import { createRateLimitGuard } from "../../middleware/rateLimit";
import { followService } from "../../services/follow.service";
import { createTRPCRouter, protectedProcedure } from "../trpc";

function limited(routeKey: string, limit: number) {
  const guard = createRateLimitGuard({ routeKey, limit, windowSeconds: 60 });
  return protectedProcedure.use(async ({ ctx, next }) => {
    await guard(ctx.user.id, ctx.requestId);
    return next();
  });
}

export const followRouter = createTRPCRouter({
  get: limited("follow.get", 120).input(discussionFollowInputSchema).query(({ ctx, input }) =>
    execute(() => followService.get(ctx.user.id, input)),
  ),
  set: limited("follow.set", 60).input(setDiscussionFollowInputSchema).mutation(({ ctx, input }) =>
    execute(() => followService.set(ctx.user.id, input)),
  ),
});
