import { z } from "zod";

export const workspaceRoleSchema = z.enum(["OWNER", "ADMIN", "MEMBER"]);

const pageSizeSchema = z.number().int().min(1).max(100).default(20);
const cursorSchema = z.string().cuid().optional();
const workspaceIdSchema = z.string().cuid();
const userIdSchema = z.string().cuid();

export const createWorkspaceInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]{3,60}$/, "Slug must be 3-60 chars, lowercase, numbers, or hyphens."),
});

export const updateWorkspaceInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  name: z.string().trim().min(2).max(120).optional(),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]{3,60}$/, "Slug must be 3-60 chars, lowercase, numbers, or hyphens.")
    .optional(),
});

export const deleteWorkspaceInputSchema = z.object({
  workspaceId: workspaceIdSchema,
});

export const getWorkspaceByIdInputSchema = z.object({
  workspaceId: workspaceIdSchema,
});

export const listWorkspacesInputSchema = z.object({
  cursor: cursorSchema,
  take: pageSizeSchema,
});

export const listWorkspaceMembersInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  cursor: cursorSchema,
  take: pageSizeSchema,
});

export const addWorkspaceMemberInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  userId: userIdSchema,
  role: workspaceRoleSchema.default("MEMBER"),
});

export const updateWorkspaceMemberRoleInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  userId: userIdSchema,
  role: workspaceRoleSchema,
});

export const removeWorkspaceMemberInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  userId: userIdSchema,
});

export const transferWorkspaceOwnershipInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  newOwnerUserId: userIdSchema,
});

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceInputSchema>;
export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceInputSchema>;
export type DeleteWorkspaceInput = z.infer<typeof deleteWorkspaceInputSchema>;
export type GetWorkspaceByIdInput = z.infer<typeof getWorkspaceByIdInputSchema>;
export type ListWorkspacesInput = z.infer<typeof listWorkspacesInputSchema>;
export type ListWorkspaceMembersInput = z.infer<typeof listWorkspaceMembersInputSchema>;
export type AddWorkspaceMemberInput = z.infer<typeof addWorkspaceMemberInputSchema>;
export type UpdateWorkspaceMemberRoleInput = z.infer<typeof updateWorkspaceMemberRoleInputSchema>;
export type RemoveWorkspaceMemberInput = z.infer<typeof removeWorkspaceMemberInputSchema>;
export type TransferWorkspaceOwnershipInput = z.infer<typeof transferWorkspaceOwnershipInputSchema>;
