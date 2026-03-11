import { z } from "zod";

const emailSchema = z.string().trim().email().max(320);
const usernameSchema = z
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

export type RegisterInput = z.infer<typeof registerInputSchema>;
export type LoginInput = z.infer<typeof loginInputSchema>;
export type LogoutInput = z.infer<typeof logoutInputSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordInputSchema>;
