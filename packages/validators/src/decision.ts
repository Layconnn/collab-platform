import { z } from "zod";

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
  idempotencyKey: z.string().trim().min(8).max(128),
});

export const decisionByIdInputSchema = z.object({
  workspaceId: id,
  decisionId: id,
});

export const listDecisionsInputSchema = z.object({
  workspaceId: id,
  status: z.enum(["PROPOSED", "DECIDED", "SUPERSEDED"]).optional(),
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
}).refine((value) => [value.question, value.outcome, value.rationale, value.alternatives, value.followUp].some((field) => field !== undefined), {
  message: "Provide at least one field to edit.",
});

export const finalizeDecisionInputSchema = decisionByIdInputSchema.extend({
  expectedVersion: z.number().int().positive(),
});

export const decisionRevisionsInputSchema = decisionByIdInputSchema.extend({
  cursor: z.number().int().positive().optional(),
  take: z.number().int().min(1).max(100).default(20),
});

export type CreateDecisionInput = z.infer<typeof createDecisionInputSchema>;
export type DecisionByIdInput = z.infer<typeof decisionByIdInputSchema>;
export type ListDecisionsInput = z.infer<typeof listDecisionsInputSchema>;
export type EditDecisionInput = z.infer<typeof editDecisionInputSchema>;
export type FinalizeDecisionInput = z.infer<typeof finalizeDecisionInputSchema>;
export type DecisionRevisionsInput = z.infer<typeof decisionRevisionsInputSchema>;
