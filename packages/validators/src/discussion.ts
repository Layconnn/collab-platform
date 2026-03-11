import { z } from "zod";

const workspaceIdSchema = z.string().cuid();
const discussionIdSchema = z.string().cuid();

export const createDiscussionInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  title: z.string().trim().min(3).max(120),
  body: z.string().trim().min(1).max(5000),
  idempotencyKey: z.string().trim().min(8).max(128).optional(),
});

export const updateDiscussionInputSchema = z.object({
  discussionId: discussionIdSchema,
  title: z.string().trim().min(3).max(120).optional(),
  body: z.string().trim().min(1).max(5000).optional(),
});

export const getDiscussionByIdInputSchema = z.object({
  discussionId: discussionIdSchema,
});

export const deleteDiscussionInputSchema = z.object({
  discussionId: discussionIdSchema,
});

export const listDiscussionsInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  cursor: z.string().cuid().optional(),
  take: z.number().int().min(1).max(100).default(20),
});

export type CreateDiscussionInput = z.infer<typeof createDiscussionInputSchema>;
export type UpdateDiscussionInput = z.infer<typeof updateDiscussionInputSchema>;
export type GetDiscussionByIdInput = z.infer<typeof getDiscussionByIdInputSchema>;
export type DeleteDiscussionInput = z.infer<typeof deleteDiscussionInputSchema>;
export type ListDiscussionsInput = z.infer<typeof listDiscussionsInputSchema>;
