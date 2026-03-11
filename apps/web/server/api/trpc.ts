import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";

import { resolveAuthenticatedUser, resolveRequestId, trackAuthFailure, isCookieAuth } from "../middleware/auth";
import { requireCsrfToken } from "../middleware/csrf";

export type RequestUser = {
  id: string;
};

export type TRPCContext = {
  user: RequestUser | null;
  requestId: string;
  headers: Headers;
  requestMethod: string | null;
  ip: string | null;
  responseHeaders: Headers;
};

function resolveClientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? null;
  }

  const realIp = headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }

  return null;
}

export async function createTRPCContext(opts: {
  headers: Headers;
  request: Request;
}): Promise<TRPCContext> {
  const requestId = resolveRequestId(opts.headers);
  const user = await resolveAuthenticatedUser(opts.headers);
  const responseHeaders = new Headers();

  return {
    user,
    requestId,
    headers: opts.headers,
    requestMethod: opts.request.method,
    ip: resolveClientIp(opts.headers),
    responseHeaders,
  };
}

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
});

export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.user) {
    await trackAuthFailure(ctx.requestId, undefined, "missing_or_invalid_auth_credentials");
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication required.",
    });
  }

  if (isCookieAuth(ctx.headers)) {
    requireCsrfToken(ctx.headers, ctx.requestMethod);
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});
