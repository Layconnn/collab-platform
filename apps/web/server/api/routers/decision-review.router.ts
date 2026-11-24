import {
  decisionByIdInputSchema,
  requestDecisionReviewInputSchema,
  respondToDecisionReviewInputSchema,
  setDecisionReviewRuleInputSchema,
  withdrawDecisionReviewInputSchema,
} from "@repo/validators/decision";

import { execute } from "../../errors/app-error";
import { createRateLimitGuard } from "../../middleware/rateLimit";
import { decisionReviewService } from "../../services/decision-review.service";
import { createTRPCRouter, protectedProcedure } from "../trpc";

function limited(routeKey: string, limit: number) {
  const guard = createRateLimitGuard({ routeKey, limit, windowSeconds: 60 });
  return protectedProcedure.use(async ({ ctx, next }) => {
    await guard(ctx.user.id, ctx.requestId);
    return next();
  });
}

export const decisionReviewRouter = createTRPCRouter({
  list: limited("decisionReview.list", 120).input(decisionByIdInputSchema).query(({ ctx, input }) =>
    execute(() => decisionReviewService.list(ctx.user.id, input)),
  ),
  request: limited("decisionReview.request", 30).input(requestDecisionReviewInputSchema).mutation(({ ctx, input }) =>
    execute(() => decisionReviewService.request(ctx.user.id, input)),
  ),
  setRule: limited("decisionReview.setRule", 30).input(setDecisionReviewRuleInputSchema).mutation(({ ctx, input }) =>
    execute(() => decisionReviewService.setRule(ctx.user.id, input)),
  ),
  withdraw: limited("decisionReview.withdraw", 30).input(withdrawDecisionReviewInputSchema).mutation(({ ctx, input }) =>
    execute(() => decisionReviewService.withdraw(ctx.user.id, input)),
  ),
  respond: limited("decisionReview.respond", 40).input(respondToDecisionReviewInputSchema).mutation(({ ctx, input }) =>
    execute(() => decisionReviewService.respond(ctx.user.id, input)),
  ),
});
