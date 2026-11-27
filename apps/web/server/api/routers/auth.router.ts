import {
  changePasswordInputSchema,
  currentUserSchema,
  loginInputSchema,
  logoutInputSchema,
  registerInputSchema,
  verifyTwoStepInputSchema,
} from "@repo/validators/auth";

import { execute } from "../../errors/app-error";
import { getSessionCookieToken } from "../../middleware/auth";
import { createRateLimitGuardByKey } from "../../middleware/rateLimit";
import { authService } from "../../services/auth.service";
import { buildAuthCookies, buildLogoutCookies } from "../../utils/auth-cookies";
import { clientOf } from "../../services/session.service";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";

const loginRateLimit = createRateLimitGuardByKey({
  routeKey: "auth.login",
  limit: 5,
  windowSeconds: 60,
});

// Five codes per challenge, and at most ten tries a minute from one address.
const verifyTwoStepRateLimit = createRateLimitGuardByKey({
  routeKey: "auth.verifyTwoStep",
  limit: 10,
  windowSeconds: 60,
});

const registerRateLimit = createRateLimitGuardByKey({
  routeKey: "auth.register",
  limit: 5,
  windowSeconds: 600,
});

// Each attempt checks the current password, so a stolen session can't use
// it to guess: five tries per user per ten minutes (#176).
const changePasswordRateLimit = createRateLimitGuardByKey({
  routeKey: "auth.changePassword",
  limit: 5,
  windowSeconds: 600,
});

const loginProcedure = publicProcedure.use(async ({ ctx, next }) => {
  const ip = ctx.ip ?? "unknown";
  await loginRateLimit(ip, ctx.requestId);
  return next();
});

const registerProcedure = publicProcedure.use(async ({ ctx, next }) => {
  const ip = ctx.ip ?? "unknown";
  await registerRateLimit(ip, ctx.requestId);
  return next();
});

function appendSetCookies(headers: Headers, cookies: string[]): void {
  for (const cookie of cookies) {
    headers.append("set-cookie", cookie);
  }
}

export const authRouter = createTRPCRouter({
  me: protectedProcedure.output(currentUserSchema).query(({ ctx }) =>
    execute(() => authService.getCurrentUser(ctx.user.id)),
  ),

  register: registerProcedure.input(registerInputSchema).mutation(({ ctx, input }) =>
    execute(async () => {
      const result = await authService.register(input, { requestId: ctx.requestId, client: clientOf(ctx.headers) });
      appendSetCookies(ctx.responseHeaders, buildAuthCookies(result));
      return {
        success: true as const,
        csrfToken: result.csrfToken,
        expiresInSeconds: result.expiresInSeconds,
      };
    }),
  ),

  login: loginProcedure.input(loginInputSchema).mutation(({ ctx, input }) =>
    execute(async () => {
      const result = await authService.login(input, { requestId: ctx.requestId, client: clientOf(ctx.headers) });
      if ("challengeToken" in result) {
        return { success: false as const, twoStep: true as const, challengeToken: result.challengeToken };
      }
      appendSetCookies(ctx.responseHeaders, buildAuthCookies(result));
      return {
        success: true as const,
        twoStep: false as const,
        csrfToken: result.csrfToken,
        expiresInSeconds: result.expiresInSeconds,
      };
    }),
  ),

  verifyTwoStep: publicProcedure
    .use(async ({ ctx, next }) => {
      await verifyTwoStepRateLimit(ctx.ip ?? "unknown", ctx.requestId);
      return next();
    })
    .input(verifyTwoStepInputSchema)
    .mutation(({ ctx, input }) =>
      execute(async () => {
        const result = await authService.verifyTwoStep(input, { requestId: ctx.requestId, client: clientOf(ctx.headers) });
        appendSetCookies(ctx.responseHeaders, buildAuthCookies(result));
        return {
          success: true as const,
          twoStep: false as const,
          csrfToken: result.csrfToken,
          expiresInSeconds: result.expiresInSeconds,
        };
      }),
    ),

  logout: protectedProcedure.input(logoutInputSchema).mutation(({ ctx, input }) =>
    execute(async () => {
      const sessionToken = input.sessionToken ?? getSessionCookieToken(ctx.headers);
      const result = await authService.logout(sessionToken, ctx.user, clientOf(ctx.headers));
      appendSetCookies(ctx.responseHeaders, buildLogoutCookies());
      return result;
    }),
  ),

  // Rate limited: each attempt checks the current password (#176).
  changePassword: protectedProcedure
    .use(async ({ ctx, next }) => {
      await changePasswordRateLimit(ctx.user.id, ctx.requestId);
      return next();
    })
    .input(changePasswordInputSchema)
    .mutation(({ ctx, input }) =>
      execute(() =>
        authService.changePassword(ctx.user.id, input, {
          requestId: ctx.requestId,
          sessionToken: getSessionCookieToken(ctx.headers),
          sessionId: ctx.user.sessionId,
          client: clientOf(ctx.headers),
        }),
      ),
    ),
});
