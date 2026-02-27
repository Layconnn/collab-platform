import { z } from "zod";

const discussionIdSchema = z.string().cuid();
const commentIdSchema = z.string().cuid();

export const createCommentInputSchema = z.object({
  discussionId: discussionIdSchema,
  parentCommentId: commentIdSchema.optional(),
  body: z.string().trim().min(1).max(5000),
  idempotencyKey: z.string().trim().min(8).max(128).optional(),
});

export const deleteCommentInputSchema = z.object({
  commentId: commentIdSchema,
});

export const getCommentByIdInputSchema = z.object({
  commentId: commentIdSchema,
});

export const updateCommentInputSchema = z.object({
  commentId: commentIdSchema,
  body: z.string().trim().min(1).max(5000),
});

export const listCommentsInputSchema = z.object({
  discussionId: discussionIdSchema,
  parentCommentId: commentIdSchema.optional(),
  cursor: z.string().cuid().optional(),
  take: z.number().int().min(1).max(100).default(20),
});

export type CreateCommentInput = z.infer<typeof createCommentInputSchema>;
export type DeleteCommentInput = z.infer<typeof deleteCommentInputSchema>;
export type GetCommentByIdInput = z.infer<typeof getCommentByIdInputSchema>;
export type UpdateCommentInput = z.infer<typeof updateCommentInputSchema>;
export type ListCommentsInput = z.infer<typeof listCommentsInputSchema>;
