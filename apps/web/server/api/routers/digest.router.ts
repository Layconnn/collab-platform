import { z } from "zod";

import { execute } from "../../errors/app-error";
import { createRateLimitGuard } from "../../middleware/rateLimit";
import { composeDigestEmail } from "../../services/digest/digest.runner";
import { digestPreferences, digestSettingsFor } from "../../services/digest/digest.preferences";
import { buildDigest } from "../../services/digest/digest.service";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";

function limited(routeKey: string, limit: number) {
  const guard = createRateLimitGuard({ routeKey, limit, windowSeconds: 60 });
  return protectedProcedure.use(async ({ ctx, next }) => {
    await guard(ctx.user.id, ctx.requestId);
    return next();
  });
}

// Unsubscribe links work without signing in, so they are limited per address.
function publicLimited(routeKey: string, limit: number) {
  const guard = createRateLimitGuard({ routeKey, limit, windowSeconds: 60 });
  return publicProcedure.use(async ({ ctx, next }) => {
    await guard(ctx.ip ?? "unknown", ctx.requestId);
    return next();
  });
}

const token = z.string().trim().min(20).max(600);

export const digestRouter = createTRPCRouter({
  // Exactly what today's digest would contain for the signed-in member (FR-12).
  preview: limited("digest.preview", 20).query(({ ctx }) => execute(async () => {
    const settings = await digestSettingsFor(ctx.user.id);
    const digest = await buildDigest(ctx.user.id, { excludedWorkspaceIds: settings.excludedWorkspaceIds });
    if (!digest) return { empty: true, enabled: settings.enabled, subject: "", html: "", text: "" };
    const { email } = composeDigestEmail(digest, new Date());
    return { empty: digest.empty, enabled: settings.enabled, ...email };
  })),
  preferences: limited("digest.preferences", 60).query(({ ctx }) => execute(() => digestPreferences.get(ctx.user.id))),
  setEnabled: limited("digest.setEnabled", 30).input(z.object({ enabled: z.boolean() })).mutation(({ ctx, input }) =>
    execute(() => digestPreferences.setEnabled(ctx.user.id, input.enabled)),
  ),
  setWorkspace: limited("digest.setWorkspace", 60).input(z.object({ workspaceId: z.string().cuid(), included: z.boolean() })).mutation(({ ctx, input }) =>
    execute(() => digestPreferences.setWorkspace(ctx.user.id, input.workspaceId, input.included)),
  ),
  describeUnsubscribe: publicLimited("digest.describeUnsubscribe", 30).input(z.object({ token })).query(({ input }) =>
    execute(() => digestPreferences.describeToken(input.token)),
  ),
  unsubscribe: publicLimited("digest.unsubscribe", 20).input(z.object({ token, undo: z.boolean().default(false) })).mutation(({ input }) =>
    execute(() => digestPreferences.applyToken(input.token, input.undo)),
  ),
});
