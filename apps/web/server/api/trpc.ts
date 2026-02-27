import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";

import { resolveAuthenticatedUser, resolveRequestId, trackAuthFailure } from "../middleware/auth";

export type RequestUser = {
  id: string;
};

export type TRPCContext = {
  user: RequestUser | null;
  requestId: string;
};

export async function createTRPCContext(opts: { headers: Headers }): Promise<TRPCContext> {
  const requestId = resolveRequestId(opts.headers);
  const user = await resolveAuthenticatedUser(opts.headers);

  return {
    user,
    requestId,
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

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});
