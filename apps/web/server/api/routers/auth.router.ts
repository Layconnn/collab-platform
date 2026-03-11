import {
  changePasswordInputSchema,
  loginInputSchema,
  logoutInputSchema,
  registerInputSchema,
} from "@repo/validators/auth";

import { toTRPCError } from "../../errors/app-error";
import { getSessionCookieToken } from "../../middleware/auth";
import { createRateLimitGuardByKey } from "../../middleware/rateLimit";
import { authService } from "../../services/auth.service";
import { buildAuthCookies, buildLogoutCookies } from "../../utils/auth-cookies";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";

const execute = async <T>(operation: () => Promise<T>) => {
  try {
    return await operation();
  } catch (error) {
    throw toTRPCError(error);
  }
};

const loginRateLimit = createRateLimitGuardByKey({
  routeKey: "auth.login",
  limit: 5,
  windowSeconds: 60,
});

const loginProcedure = publicProcedure.use(async ({ ctx, next }) => {
  const ip = ctx.ip ?? "unknown";
  await loginRateLimit(ip, ctx.requestId);
  return next();
});

function appendSetCookies(headers: Headers, cookies: string[]): void {
  for (const cookie of cookies) {
    headers.append("set-cookie", cookie);
  }
}

export const authRouter = createTRPCRouter({
  register: publicProcedure.input(registerInputSchema).mutation(({ ctx, input }) =>
    execute(async () => {
      const result = await authService.register(input, { requestId: ctx.requestId });
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
      const result = await authService.login(input, { requestId: ctx.requestId });
      appendSetCookies(ctx.responseHeaders, buildAuthCookies(result));
      return {
        success: true as const,
        csrfToken: result.csrfToken,
        expiresInSeconds: result.expiresInSeconds,
      };
    }),
  ),

  logout: protectedProcedure.input(logoutInputSchema).mutation(({ ctx, input }) =>
    execute(async () => {
      const sessionToken = input.sessionToken ?? getSessionCookieToken(ctx.headers);
      const result = await authService.logout(sessionToken);
      appendSetCookies(ctx.responseHeaders, buildLogoutCookies());
      return result;
    }),
  ),

  changePassword: protectedProcedure
    .input(changePasswordInputSchema)
    .mutation(({ ctx, input }) =>
      execute(() =>
        authService.changePassword(ctx.user.id, input, {
          requestId: ctx.requestId,
        }),
      ),
    ),
});
