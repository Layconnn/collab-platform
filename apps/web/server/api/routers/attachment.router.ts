import { createUploadInputSchema } from "@repo/validators/files";

import { execute } from "../../errors/app-error";
import { createRateLimitGuard } from "../../middleware/rateLimit";
import { attachmentService } from "../../services/files/attachment.service";
import { createTRPCRouter, protectedProcedure } from "../trpc";

function limited(routeKey: string, limit: number) {
  const guard = createRateLimitGuard({ routeKey, limit, windowSeconds: 60 });
  return protectedProcedure.use(async ({ ctx, next }) => {
    await guard(ctx.user.id, ctx.requestId);
    return next();
  });
}

export const attachmentRouter = createTRPCRouter({
  // Whether attaching is switched on (NFR-6); the composer hides it otherwise.
  config: protectedProcedure.query(() => attachmentService.config()),
  createUpload: limited("attachment.createUpload", 30).input(createUploadInputSchema).mutation(({ ctx, input }) =>
    execute(() => attachmentService.createUpload(ctx.user.id, input)),
  ),
});
