import { z } from "zod";

import { attachmentIdsSchema } from "./files";

const id = z.string().cuid();
const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => text(max).optional();

export const createDecisionInputSchema = z.object({
  workspaceId: id,
  sourceDiscussionId: id,
  question: text(240),
  outcome: optionalText(5000),
  rationale: optionalText(5000),
  alternatives: optionalText(5000),
  followUp: optionalText(2000),
  attachmentIds: attachmentIdsSchema.optional(),
  idempotencyKey: z.string().trim().min(8).max(128),
});

export const decisionByIdInputSchema = z.object({
  workspaceId: id,
  decisionId: id,
});

export const listDecisionsInputSchema = z.object({
  workspaceId: id,
  status: z.enum(["PROPOSED", "DECIDED", "SUPERSEDED"]).optional(),
  // Proposals where the viewer's review is still pending (decision reviews, FR-12).
  waitingForMe: z.boolean().optional(),
  cursor: id.optional(),
  take: z.number().int().min(1).max(100).default(20),
});

export const editDecisionInputSchema = decisionByIdInputSchema.extend({
  expectedVersion: z.number().int().positive(),
  question: text(240).optional(),
  outcome: text(5000).nullable().optional(),
  rationale: text(5000).nullable().optional(),
  alternatives: text(5000).nullable().optional(),
  followUp: text(2000).nullable().optional(),
  // The proposal's full list of files in order, when it changes.
  attachmentIds: attachmentIdsSchema.optional(),
}).refine((value) => [value.question, value.outcome, value.rationale, value.alternatives, value.followUp, value.attachmentIds].some((field) => field !== undefined), {
  message: "Provide at least one field to edit.",
});

export const finalizeDecisionInputSchema = decisionByIdInputSchema.extend({
  expectedVersion: z.number().int().positive(),
  // "Finalize anyway" when the review rule is not met (decision reviews, FR-9).
  overrideReason: z.string().trim().min(10).max(2000).optional(),
});

export const deleteDecisionInputSchema = decisionByIdInputSchema.extend({
  expectedVersion: z.number().int().positive(),
});

export const decisionRevisionsInputSchema = decisionByIdInputSchema.extend({
  cursor: z.number().int().positive().optional(),
  take: z.number().int().min(1).max(100).default(20),
});

export const supersedeDecisionInputSchema = z.object({
  workspaceId: id,
  oldDecisionId: id,
  replacementDecisionId: id,
  expectedOldVersion: z.number().int().positive(),
  expectedReplacementVersion: z.number().int().positive(),
  reason: z.string().trim().min(10).max(2000),
});

export const replacementCandidatesInputSchema = z.object({
  workspaceId: id,
  oldDecisionId: id,
  cursor: id.optional(),
  take: z.number().int().min(1).max(30).default(20),
});

// Decision reviews (decision reviews PRD, FR-1 to FR-4).
export const MAX_DECISION_REVIEWERS = 10;
const reviewNote = z.string().trim().max(2000);
const reviewRule = z.object({
  rule: z.enum(["ALL", "AT_LEAST"]),
  requiredApprovals: z.number().int().min(1).max(MAX_DECISION_REVIEWERS).optional(),
}).refine((value) => value.rule === "ALL" || value.requiredApprovals !== undefined, {
  message: "Say how many approvals are needed.",
  path: ["requiredApprovals"],
});

export const requestDecisionReviewInputSchema = decisionByIdInputSchema.extend({
  reviewerIds: z.array(id).min(1).max(MAX_DECISION_REVIEWERS)
    .refine((ids) => new Set(ids).size === ids.length, { message: "Each reviewer can be asked once." }),
  rule: reviewRule.optional(),
});

export const setDecisionReviewRuleInputSchema = decisionByIdInputSchema.and(reviewRule);

export const withdrawDecisionReviewInputSchema = decisionByIdInputSchema.extend({
  reviewerId: id,
});

export const respondToDecisionReviewInputSchema = decisionByIdInputSchema.extend({
  expectedVersion: z.number().int().positive(),
  response: z.enum(["APPROVED", "OBJECTED"]),
  note: reviewNote.optional(),
}).refine((value) => value.response !== "OBJECTED" || Boolean(value.note), {
  message: "Say why you object.",
  path: ["note"],
});

export type CreateDecisionInput = z.infer<typeof createDecisionInputSchema>;
export type DecisionByIdInput = z.infer<typeof decisionByIdInputSchema>;
export type ListDecisionsInput = z.infer<typeof listDecisionsInputSchema>;
export type EditDecisionInput = z.infer<typeof editDecisionInputSchema>;
export type FinalizeDecisionInput = z.infer<typeof finalizeDecisionInputSchema>;
export type DeleteDecisionInput = z.infer<typeof deleteDecisionInputSchema>;
export type DecisionRevisionsInput = z.infer<typeof decisionRevisionsInputSchema>;
export type SupersedeDecisionInput = z.infer<typeof supersedeDecisionInputSchema>;
export type ReplacementCandidatesInput = z.infer<typeof replacementCandidatesInputSchema>;
export type RequestDecisionReviewInput = z.infer<typeof requestDecisionReviewInputSchema>;
export type SetDecisionReviewRuleInput = z.infer<typeof setDecisionReviewRuleInputSchema>;
export type WithdrawDecisionReviewInput = z.infer<typeof withdrawDecisionReviewInputSchema>;
export type RespondToDecisionReviewInput = z.infer<typeof respondToDecisionReviewInputSchema>;
