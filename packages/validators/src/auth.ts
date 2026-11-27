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
});

// Settings PRD, FR-1 and FR-2. An empty name shows the username instead.
export const updateProfileInputSchema = z.object({
  name: z.string().trim().max(60),
});

export const changeUsernameInputSchema = z.object({
  username: usernameSchema,
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
export type UsernameAvailableInput = z.infer<typeof usernameAvailableInputSchema>;
