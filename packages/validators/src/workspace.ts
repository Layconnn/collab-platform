import { z } from "zod";
import { usernameSchema } from "./auth";

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

export const searchMentionMembersInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  query: z.string().max(30).regex(/^[a-zA-Z0-9_]*$/).transform((value) => value.toLowerCase()),
});

export const addWorkspaceMemberInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  userId: userIdSchema,
  role: workspaceRoleSchema.default("MEMBER"),
});

export const resolveWorkspaceMemberCandidateInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  username: usernameSchema,
});

export const addWorkspaceMemberByUsernameInputSchema = resolveWorkspaceMemberCandidateInputSchema.extend({
  role: z.enum(["ADMIN", "MEMBER"]).default("MEMBER"),
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

// Settings PRD, FR-14: leave a workspace you don't own.
export const leaveWorkspaceInputSchema = z.object({
  workspaceId: workspaceIdSchema,
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
export type SearchMentionMembersInput = z.infer<typeof searchMentionMembersInputSchema>;
export type AddWorkspaceMemberInput = z.infer<typeof addWorkspaceMemberInputSchema>;
export type ResolveWorkspaceMemberCandidateInput = z.infer<typeof resolveWorkspaceMemberCandidateInputSchema>;
export type AddWorkspaceMemberByUsernameInput = z.infer<typeof addWorkspaceMemberByUsernameInputSchema>;
export type UpdateWorkspaceMemberRoleInput = z.infer<typeof updateWorkspaceMemberRoleInputSchema>;
export type RemoveWorkspaceMemberInput = z.infer<typeof removeWorkspaceMemberInputSchema>;
export type TransferWorkspaceOwnershipInput = z.infer<typeof transferWorkspaceOwnershipInputSchema>;
export type LeaveWorkspaceInput = z.infer<typeof leaveWorkspaceInputSchema>;

// Invite links (invite links PRD).
export const INVITE_EXPIRY_DAYS = [1, 7, 30] as const;
export const MAX_ACTIVE_INVITES = 20;
// 32 random bytes in base64url.
export const inviteTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/, "Invalid invite link.");

export const createInviteInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  role: z.enum(["MEMBER", "ADMIN"]).default("MEMBER"),
  expiresInDays: z.union([z.literal(1), z.literal(7), z.literal(30)]).default(7),
  maxUses: z.number().int().min(1).max(100).optional(),
  name: z.string().trim().max(60).optional().transform((value) => value || undefined),
});

export const listInvitesInputSchema = z.object({ workspaceId: workspaceIdSchema });
export const revokeInviteInputSchema = z.object({ workspaceId: workspaceIdSchema, inviteId: z.string().cuid() });
export const inviteByTokenInputSchema = z.object({ token: inviteTokenSchema });

export type CreateInviteInput = z.infer<typeof createInviteInputSchema>;
