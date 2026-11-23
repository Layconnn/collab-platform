import { z } from "zod";

export const ACTIVITY_FILTERS = ["all", "discussions", "comments", "decisions", "members"] as const;
export type ActivityFilter = (typeof ACTIVITY_FILTERS)[number];

export const listActivityInputSchema = z.object({
  workspaceId: z.string().cuid(),
  filter: z.enum(ACTIVITY_FILTERS).default("all"),
  cursor: z.string().cuid().optional(),
  take: z.number().int().min(1).max(50).default(20),
});

export type ListActivityInput = z.infer<typeof listActivityInputSchema>;
