import { disableTwoStepInputSchema, enableTwoStepInputSchema, regenerateRecoveryCodesInputSchema } from "@repo/validators/auth";
import { securityLogInputSchema, signOutSessionInputSchema } from "@repo/validators/security";

import { execute } from "../../errors/app-error";
import { getSessionCookieToken } from "../../middleware/auth";
import { createRateLimitGuard } from "../../middleware/rateLimit";
import { clientOf, sessionService } from "../../services/session.service";
import { twoStepService } from "../../services/two-step.service";
import { createTRPCRouter, protectedProcedure } from "../trpc";

function limited(routeKey: string, limit: number) {
  const guard = createRateLimitGuard({ routeKey, limit, windowSeconds: 60 });
  return protectedProcedure.use(async ({ ctx, next }) => {
    await guard(ctx.user.id, ctx.requestId);
    return next();
  });
}

// Settings PRD, FR-8 to FR-10. Signing out sessions is limited harder.
export const securityRouter = createTRPCRouter({
  sessions: limited("security.sessions", 60).query(({ ctx }) =>
    execute(() => sessionService.list(ctx.user.id, ctx.user.sessionId)),
  ),
  signOutSession: limited("security.signOutSession", 20).input(signOutSessionInputSchema).mutation(({ ctx, input }) =>
    execute(() => sessionService.signOut(ctx.user.id, input.sessionId, { currentSessionId: ctx.user.sessionId, client: clientOf(ctx.headers) })),
  ),
  signOutOthers: limited("security.signOutOthers", 10).mutation(({ ctx }) =>
    execute(() => sessionService.signOutOthers(ctx.user.id, {
      currentSessionId: ctx.user.sessionId,
      sessionToken: getSessionCookieToken(ctx.headers),
      client: clientOf(ctx.headers),
    })),
  ),
  log: limited("security.log", 60).input(securityLogInputSchema).query(({ ctx, input }) =>
    execute(() => sessionService.log(ctx.user.id, input)),
  ),

  // Two-step sign-in (FR-11, FR-12). Every call that checks a code is limited
  // to a few tries a minute.
  twoStep: limited("security.twoStep", 60).query(({ ctx }) =>
    execute(() => twoStepService.status(ctx.user.id)),
  ),
  beginTwoStep: limited("security.beginTwoStep", 10).mutation(({ ctx }) =>
    execute(() => twoStepService.begin(ctx.user.id)),
  ),
  enableTwoStep: limited("security.enableTwoStep", 6).input(enableTwoStepInputSchema).mutation(({ ctx, input }) =>
    execute(() => twoStepService.enable(ctx.user.id, input.code, { client: clientOf(ctx.headers), sessionId: ctx.user.sessionId })),
  ),
  disableTwoStep: limited("security.disableTwoStep", 5).input(disableTwoStepInputSchema).mutation(({ ctx, input }) =>
    execute(() => twoStepService.disable(ctx.user.id, input, { client: clientOf(ctx.headers), sessionId: ctx.user.sessionId })),
  ),
  regenerateRecoveryCodes: limited("security.regenerateRecoveryCodes", 5).input(regenerateRecoveryCodesInputSchema).mutation(({ ctx, input }) =>
    execute(() => twoStepService.regenerateRecoveryCodes(ctx.user.id, input.code, { client: clientOf(ctx.headers), sessionId: ctx.user.sessionId })),
  ),
});
