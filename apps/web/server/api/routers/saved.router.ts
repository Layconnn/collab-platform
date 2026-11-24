import { listSavedInputSchema, savedInWorkspaceInputSchema, setSavedInputSchema } from "@repo/validators/discussion";

import { execute } from "../../errors/app-error";
import { createRateLimitGuard } from "../../middleware/rateLimit";
import { savedService } from "../../services/saved.service";
import { createTRPCRouter, protectedProcedure } from "../trpc";

function limited(routeKey: string, limit: number) {
  const guard = createRateLimitGuard({ routeKey, limit, windowSeconds: 60 });
  return protectedProcedure.use(async ({ ctx, next }) => {
    await guard(ctx.user.id, ctx.requestId);
    return next();
  });
}

export const savedRouter = createTRPCRouter({
  list: limited("saved.list", 80).input(listSavedInputSchema).query(({ ctx, input }) =>
    execute(() => savedService.list(ctx.user.id, input)),
  ),
  idsInWorkspace: limited("saved.idsInWorkspace", 120).input(savedInWorkspaceInputSchema).query(({ ctx, input }) =>
    execute(() => savedService.idsInWorkspace(ctx.user.id, input)),
  ),
  set: limited("saved.set", 60).input(setSavedInputSchema).mutation(({ ctx, input }) =>
    execute(() => savedService.set(ctx.user.id, input)),
  ),
});
