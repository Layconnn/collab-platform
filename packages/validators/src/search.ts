import { z } from "zod";

export const SEARCH_RESULT_TYPES = ["DECISION", "DISCUSSION", "COMMENT"] as const;
export type SearchResultType = (typeof SEARCH_RESULT_TYPES)[number];

export const searchInputSchema = z.object({
  query: z.string().trim().max(200),
  workspaceId: z.string().cuid().optional(),
  types: z.array(z.enum(SEARCH_RESULT_TYPES)).min(1).max(3).optional(),
  status: z.enum(["PROPOSED", "DECIDED", "SUPERSEDED"]).optional(),
  authorId: z.string().cuid().optional(),
  updatedAfter: z.coerce.date().optional(),
  cursor: z.string().max(40).optional(),
  take: z.number().int().min(1).max(50).default(20),
});

export type SearchInput = z.infer<typeof searchInputSchema>;
