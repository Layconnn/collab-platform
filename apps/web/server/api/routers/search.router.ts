import { searchInputSchema } from "@repo/validators/search";

import { execute } from "../../errors/app-error";
import { createRateLimitGuard } from "../../middleware/rateLimit";
import { searchService } from "../../services/search.service";
import { createTRPCRouter, protectedProcedure } from "../trpc";

// Live search sends a request per pause in typing, so the limit is generous.
const searchGuard = createRateLimitGuard({ routeKey: "search.query", limit: 120, windowSeconds: 60 });

export const searchRouter = createTRPCRouter({
  query: protectedProcedure
    .use(async ({ ctx, next }) => {
      await searchGuard(ctx.user.id, ctx.requestId);
      return next();
    })
    .input(searchInputSchema)
    .query(({ ctx, input }) => execute(() => searchService.query(ctx.user.id, input))),
});
