import { updatePreferencesInputSchema, visitWorkspaceInputSchema } from "@repo/validators/preferences";

import { execute } from "../../errors/app-error";
import { createRateLimitGuard } from "../../middleware/rateLimit";
import { preferencesService } from "../../services/preferences.service";
import { createTRPCRouter, protectedProcedure } from "../trpc";

function limited(routeKey: string, limit: number) {
  const guard = createRateLimitGuard({ routeKey, limit, windowSeconds: 60 });
  return protectedProcedure.use(async ({ ctx, next }) => {
    await guard(ctx.user.id, ctx.requestId);
    return next();
  });
}

// Settings PRD, FR-15 and FR-16.
export const preferencesRouter = createTRPCRouter({
  get: limited("preferences.get", 120).query(({ ctx }) => execute(() => preferencesService.get(ctx.user.id))),
  update: limited("preferences.update", 60).input(updatePreferencesInputSchema).mutation(({ ctx, input }) =>
    execute(() => preferencesService.update(ctx.user.id, input)),
  ),
  visit: limited("preferences.visit", 60).input(visitWorkspaceInputSchema).mutation(({ ctx, input }) =>
    execute(() => preferencesService.visit(ctx.user.id, input)),
  ),
});
