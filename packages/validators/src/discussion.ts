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

// Reactions (Markdown, reactions, follow and pin PRD, FR-6). The same eight
// emoji are enforced by a CHECK constraint in the database.
export const REACTION_EMOJI = ["👍", "❤️", "🎉", "😄", "🤔", "👀", "🚀", "✅"] as const;

const reactionTarget = z.object({
  workspaceId: z.string().cuid(),
  discussionId: z.string().cuid().optional(),
  commentId: z.string().cuid().optional(),
}).refine((value) => Boolean(value.discussionId) !== Boolean(value.commentId), { message: "React to one discussion or one reply." });

// Sets the member's reaction on or off; repeating a request changes nothing.
export const setReactionInputSchema = reactionTarget.and(z.object({
  emoji: z.enum(REACTION_EMOJI),
  active: z.boolean(),
}));

export const discussionReactionsInputSchema = z.object({
  workspaceId: z.string().cuid(),
  discussionId: z.string().cuid(),
});

export type SetReactionInput = z.infer<typeof setReactionInputSchema>;
export type DiscussionReactionsInput = z.infer<typeof discussionReactionsInputSchema>;

// Following and muting (Markdown, reactions, follow and pin PRD, FR-9 to FR-12).
export const discussionFollowInputSchema = z.object({
  workspaceId: z.string().cuid(),
  discussionId: z.string().cuid(),
});

export const setDiscussionFollowInputSchema = discussionFollowInputSchema.extend({
  status: z.enum(["FOLLOWING", "MUTED", "NONE"]),
});

export type DiscussionFollowInput = z.infer<typeof discussionFollowInputSchema>;
export type SetDiscussionFollowInput = z.infer<typeof setDiscussionFollowInputSchema>;
