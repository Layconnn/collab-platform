import {
  changeUsernameInputSchema,
  photoUploadInputSchema,
  setPhotoInputSchema,
  updateProfileInputSchema,
  usernameAvailableInputSchema,
} from "@repo/validators/auth";

import { execute } from "../../errors/app-error";
import { createRateLimitGuard } from "../../middleware/rateLimit";
import { profileService } from "../../services/profile.service";
import { createTRPCRouter, protectedProcedure } from "../trpc";

function limited(routeKey: string, limit: number, windowSeconds = 60) {
  const guard = createRateLimitGuard({ routeKey, limit, windowSeconds });
  return protectedProcedure.use(async ({ ctx, next }) => {
    await guard(ctx.user.id, ctx.requestId);
    return next();
  });
}

// Settings PRD, FR-1 and FR-2. Availability is checked as the person types;
// changing a username is rare, so it is limited harder.
export const profileRouter = createTRPCRouter({
  update: limited("profile.update", 20).input(updateProfileInputSchema).mutation(({ ctx, input }) =>
    execute(() => profileService.updateProfile(ctx.user.id, input)),
  ),
  usernameAvailable: limited("profile.usernameAvailable", 60).input(usernameAvailableInputSchema).query(({ ctx, input }) =>
    execute(() => profileService.usernameAvailable(ctx.user.id, input)),
  ),
  photoUpload: limited("profile.photoUpload", 10).input(photoUploadInputSchema).mutation(({ ctx, input }) =>
    execute(() => profileService.createPhotoUpload(ctx.user.id, input)),
  ),
  setPhoto: limited("profile.setPhoto", 10).input(setPhotoInputSchema).mutation(({ ctx, input }) =>
    execute(() => profileService.setPhoto(ctx.user.id, input)),
  ),
  removePhoto: limited("profile.removePhoto", 10).mutation(({ ctx }) =>
    execute(() => profileService.removePhoto(ctx.user.id)),
  ),
  changeUsername: limited("profile.changeUsername", 5, 600).input(changeUsernameInputSchema).mutation(({ ctx, input }) =>
    execute(() => profileService.changeUsername(ctx.user.id, input)),
  ),
});
