import {
  createDecisionInputSchema,
  decisionByIdInputSchema,
  decisionRevisionsInputSchema,
  deleteDecisionInputSchema,
  editDecisionInputSchema,
  finalizeDecisionInputSchema,
  listDecisionsInputSchema,
  replacementCandidatesInputSchema,
  supersedeDecisionInputSchema,
} from "@repo/validators/decision";

import { execute } from "../../errors/app-error";
import { createRateLimitGuard } from "../../middleware/rateLimit";
import { decisionService } from "../../services/decision.service";
import { createTRPCRouter, protectedProcedure } from "../trpc";

function limited(routeKey: string, limit: number) {
  const guard = createRateLimitGuard({ routeKey, limit, windowSeconds: 60 });
  return protectedProcedure.use(async ({ ctx, next }) => {
    await guard(ctx.user.id, ctx.requestId);
    return next();
  });
}

export const decisionRouter = createTRPCRouter({
  create: limited("decision.create", 30).input(createDecisionInputSchema).mutation(({ ctx, input }) =>
    execute(() => decisionService.create(ctx.user.id, input)),
  ),
  getById: limited("decision.getById", 120).input(decisionByIdInputSchema).query(({ ctx, input }) =>
    execute(() => decisionService.getById(ctx.user.id, input)),
  ),
  listByWorkspace: limited("decision.listByWorkspace", 80).input(listDecisionsInputSchema).query(({ ctx, input }) =>
    execute(() => decisionService.listByWorkspace(ctx.user.id, input)),
  ),
  edit: limited("decision.edit", 40).input(editDecisionInputSchema).mutation(({ ctx, input }) =>
    execute(() => decisionService.edit(ctx.user.id, input)),
  ),
  finalize: limited("decision.finalize", 20).input(finalizeDecisionInputSchema).mutation(({ ctx, input }) =>
    execute(() => decisionService.finalize(ctx.user.id, input)),
  ),
  delete: limited("decision.delete", 20).input(deleteDecisionInputSchema).mutation(({ ctx, input }) =>
    execute(() => decisionService.softDelete(ctx.user.id, input)),
  ),
  revisions: limited("decision.revisions", 80).input(decisionRevisionsInputSchema).query(({ ctx, input }) =>
    execute(() => decisionService.revisions(ctx.user.id, input)),
  ),
  replacementCandidates: limited("decision.replacementCandidates", 80).input(replacementCandidatesInputSchema).query(({ ctx, input }) =>
    execute(() => decisionService.replacementCandidates(ctx.user.id, input)),
  ),
  replacementHistory: limited("decision.replacementHistory", 80).input(decisionByIdInputSchema).query(({ ctx, input }) =>
    execute(() => decisionService.replacementHistory(ctx.user.id, input)),
  ),
  supersede: limited("decision.supersede", 20).input(supersedeDecisionInputSchema).mutation(({ ctx, input }) =>
    execute(() => decisionService.supersede(ctx.user.id, input)),
  ),
});
