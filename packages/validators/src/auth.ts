import { z } from "zod";

const emailSchema = z.string().trim().email().max(320);
export const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(30)
  .regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores.")
  .transform((value) => value.toLowerCase());
const passwordSchema = z.string().min(8).max(128);

export const registerInputSchema = z.object({
  email: emailSchema,
  username: usernameSchema,
  password: passwordSchema,
});

export const loginInputSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

// Two-step sign-in (settings PRD, FR-11 to FR-13). A code is six digits from
// the authenticator, or a recovery code like "abcde-fghjk".
export const twoStepCodeSchema = z.string().trim().min(6).max(24);

export const verifyTwoStepInputSchema = z.object({
  challengeToken: z.string().min(32).max(64),
  code: twoStepCodeSchema,
});

export const enableTwoStepInputSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code.") });
export const disableTwoStepInputSchema = z.object({ password: passwordSchema, code: twoStepCodeSchema });
export const regenerateRecoveryCodesInputSchema = enableTwoStepInputSchema;

export type VerifyTwoStepInput = z.infer<typeof verifyTwoStepInputSchema>;

export const logoutInputSchema = z.object({
  sessionToken: z.string().min(16).optional(),
});

export const changePasswordInputSchema = z.object({
  currentPassword: passwordSchema,
  newPassword: passwordSchema,
});

export const currentUserSchema = z.object({
  id: z.string().cuid(),
  email: emailSchema,
  username: z.string(),
  name: z.string().nullable(),
  usernameChangedAt: z.date().nullable(),
  avatarKey: z.string().nullable(),
});

// Settings PRD, FR-1 and FR-2. An empty name shows the username instead.
export const updateProfileInputSchema = z.object({
  name: z.string().trim().max(60),
});

export const changeUsernameInputSchema = z.object({
  username: usernameSchema,
});

// Profile photos (settings PRD, FR-3): the browser crops to a 256×256 image,
// so the stored file is small whatever was picked.
export const PHOTO_LIMITS = { maxBytes: 200_000, pixels: 256, maxSourceBytes: 5 * 1024 * 1024 } as const;
export const AVATAR_KEY_PATTERN = /^avatars\/[a-z0-9]{20,40}\/[a-f0-9]{32}\.(webp|jpg)$/;
// WebP where the browser can encode it, JPEG otherwise (Safari).
export const PHOTO_TYPES = ["image/webp", "image/jpeg"] as const;

export const photoUploadInputSchema = z.object({
  contentType: z.enum(PHOTO_TYPES),
  size: z.number().int().min(1).max(PHOTO_LIMITS.maxBytes),
});

export const setPhotoInputSchema = z.object({
  key: z.string().regex(AVATAR_KEY_PATTERN),
});

// Checked as the person types, so it takes any text and explains what's wrong.
export const usernameAvailableInputSchema = z.object({
  username: z.string().max(60),
});

export type RegisterInput = z.infer<typeof registerInputSchema>;
export type LoginInput = z.infer<typeof loginInputSchema>;
export type LogoutInput = z.infer<typeof logoutInputSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordInputSchema>;
export type CurrentUser = z.infer<typeof currentUserSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileInputSchema>;
export type ChangeUsernameInput = z.infer<typeof changeUsernameInputSchema>;
export type PhotoUploadInput = z.infer<typeof photoUploadInputSchema>;
export type SetPhotoInput = z.infer<typeof setPhotoInputSchema>;
export type UsernameAvailableInput = z.infer<typeof usernameAvailableInputSchema>;
