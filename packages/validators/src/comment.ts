import { z } from "zod";

import { attachmentIdsSchema } from "./files";

const discussionIdSchema = z.string().cuid();
const commentIdSchema = z.string().cuid();

// A reply may be files only, with no text (file uploads PRD, FR-6).
const hasTextOrFiles = (value: { body?: string; attachmentIds?: string[] }) => Boolean(value.body?.trim()) || Boolean(value.attachmentIds?.length);

export const createCommentInputSchema = z.object({
  discussionId: discussionIdSchema,
  parentCommentId: commentIdSchema.optional(),
  body: z.string().trim().max(5000),
  attachmentIds: attachmentIdsSchema.optional(),
  idempotencyKey: z.string().trim().min(8).max(128).optional(),
}).refine(hasTextOrFiles, { message: "Write a reply or attach a file.", path: ["body"] });

export const deleteCommentInputSchema = z.object({
  commentId: commentIdSchema,
});

export const getCommentByIdInputSchema = z.object({
  commentId: commentIdSchema,
});

// attachmentIds, when given, is the reply's full list of files in order:
// existing ones to keep and new uploads to add; the rest are removed.
export const updateCommentInputSchema = z.object({
  commentId: commentIdSchema,
  body: z.string().trim().max(5000),
  attachmentIds: attachmentIdsSchema.optional(),
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
