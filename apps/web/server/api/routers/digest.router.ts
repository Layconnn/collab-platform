import { execute } from "../../errors/app-error";
import { createRateLimitGuard } from "../../middleware/rateLimit";
import { appBaseUrl, renderDigest } from "../../services/digest/digest.email";
import { buildDigest } from "../../services/digest/digest.service";
import { createTRPCRouter, protectedProcedure } from "../trpc";

function limited(routeKey: string, limit: number) {
  const guard = createRateLimitGuard({ routeKey, limit, windowSeconds: 60 });
  return protectedProcedure.use(async ({ ctx, next }) => {
    await guard(ctx.user.id, ctx.requestId);
    return next();
  });
}

export const digestRouter = createTRPCRouter({
  // Exactly what today's digest would contain for the signed-in member (FR-12).
  preview: limited("digest.preview", 20).query(({ ctx }) => execute(async () => {
    const digest = await buildDigest(ctx.user.id);
    if (!digest) return { empty: true, subject: "", html: "", text: "" };
    return { empty: digest.empty, ...renderDigest(digest, { baseUrl: appBaseUrl() }) };
  })),
});
