import {
  closeAccountInputSchema,
  confirmEmailChangeInputSchema,
  disableTwoStepInputSchema,
  enableTwoStepInputSchema,
  regenerateRecoveryCodesInputSchema,
  requestEmailChangeInputSchema,
} from "@repo/validators/auth";
import { securityLogInputSchema, signOutSessionInputSchema } from "@repo/validators/security";

import { execute } from "../../errors/app-error";
import { getSessionCookieToken } from "../../middleware/auth";
import { createRateLimitGuard } from "../../middleware/rateLimit";
import { accountService } from "../../services/account.service";
import { emailChangeService } from "../../services/email-change.service";
import { clientOf, sessionService } from "../../services/session.service";
import { buildLogoutCookies } from "../../utils/auth-cookies";
import { twoStepService } from "../../services/two-step.service";
import { createTRPCRouter, protectedProcedure } from "../trpc";

function limited(routeKey: string, limit: number, windowSeconds = 60) {
  const guard = createRateLimitGuard({ routeKey, limit, windowSeconds });
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
  // Changing your email (FR-20). Asking sends mail, so three an hour;
  // each code check is limited too.
  emailChange: limited("security.emailChange", 60).query(({ ctx }) =>
    execute(() => emailChangeService.status(ctx.user.id)),
  ),
  requestEmailChange: limited("security.requestEmailChange", 3, 3600).input(requestEmailChangeInputSchema).mutation(({ ctx, input }) =>
    execute(() => emailChangeService.request(ctx.user.id, input)),
  ),
  confirmEmailChange: limited("security.confirmEmailChange", 10).input(confirmEmailChangeInputSchema).mutation(({ ctx, input }) =>
    execute(() => emailChangeService.confirm(ctx.user.id, input, { client: clientOf(ctx.headers), sessionId: ctx.user.sessionId })),
  ),
  cancelEmailChange: limited("security.cancelEmailChange", 20).mutation(({ ctx }) =>
    execute(() => emailChangeService.cancel(ctx.user.id)),
  ),

  // Your data (FR-17, FR-18). One export an hour; closing checks the
  // password, so five tries in ten minutes.
  exportData: limited("security.exportData", 1, 3600).mutation(({ ctx }) =>
    execute(() => accountService.exportData(ctx.user.id, { client: clientOf(ctx.headers), sessionId: ctx.user.sessionId })),
  ),
  closeAccount: limited("security.closeAccount", 5, 600).input(closeAccountInputSchema).mutation(({ ctx, input }) =>
    execute(async () => {
      const result = await accountService.close(ctx.user.id, input, { client: clientOf(ctx.headers), sessionId: ctx.user.sessionId });
      for (const cookie of buildLogoutCookies()) ctx.responseHeaders.append("set-cookie", cookie);
      return result;
    }),
  ),
  regenerateRecoveryCodes: limited("security.regenerateRecoveryCodes", 5).input(regenerateRecoveryCodesInputSchema).mutation(({ ctx, input }) =>
    execute(() => twoStepService.regenerateRecoveryCodes(ctx.user.id, input.code, { client: clientOf(ctx.headers), sessionId: ctx.user.sessionId })),
  ),
});
