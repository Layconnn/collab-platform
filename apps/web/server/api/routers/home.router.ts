import { dismissNeedsInputSchema, needsYouInputSchema } from "@repo/validators/home";

import { execute } from "../../errors/app-error";
import { createRateLimitGuard } from "../../middleware/rateLimit";
import { homeService } from "../../services/home.service";
import { createTRPCRouter, protectedProcedure } from "../trpc";

function limited(routeKey: string, limit: number) {
  const guard = createRateLimitGuard({ routeKey, limit, windowSeconds: 60 });
  return protectedProcedure.use(async ({ ctx, next }) => {
    await guard(ctx.user.id, ctx.requestId);
    return next();
  });
}

export const homeRouter = createTRPCRouter({
  needsYou: limited("home.needsYou", 120).input(needsYouInputSchema).query(({ ctx, input }) =>
    execute(() => homeService.needsYou(ctx.user.id, input)),
  ),
  pulse: limited("home.pulse", 120).query(({ ctx }) => execute(() => homeService.pulse(ctx.user.id))),
  recentDecisions: limited("home.recentDecisions", 120).query(({ ctx }) => execute(() => homeService.recentDecisions(ctx.user.id))),
  dismiss: limited("home.dismiss", 120).input(dismissNeedsInputSchema).mutation(({ ctx, input }) =>
    execute(() => homeService.dismiss(ctx.user.id, input)),
  ),
  dismissAll: limited("home.dismissAll", 30).mutation(({ ctx }) =>
    execute(() => homeService.dismissAll(ctx.user.id)),
  ),
});
