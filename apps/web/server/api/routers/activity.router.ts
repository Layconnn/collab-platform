import { listActivityInputSchema } from "@repo/validators/activity";

import { execute } from "../../errors/app-error";
import { createRateLimitGuard } from "../../middleware/rateLimit";
import { activityService } from "../../services/activity.service";
import { createTRPCRouter, protectedProcedure } from "../trpc";

const listGuard = createRateLimitGuard({ routeKey: "activity.listByWorkspace", limit: 80, windowSeconds: 60 });

export const activityRouter = createTRPCRouter({
  listByWorkspace: protectedProcedure
    .use(async ({ ctx, next }) => {
      await listGuard(ctx.user.id, ctx.requestId);
      return next();
    })
    .input(listActivityInputSchema)
    .query(({ ctx, input }) => execute(() => activityService.listByWorkspace(ctx.user.id, input))),
});
