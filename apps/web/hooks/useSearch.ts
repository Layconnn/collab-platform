"use client";

import type { SearchInput } from "@repo/validators/search";

import { trpc } from "@/lib/trpc/api-client";

export type SearchFilters = Omit<SearchInput, "cursor" | "take">;

// Queries shorter than two characters never reach the server (FR-15).
export function useSearch(filters: SearchFilters, take = 20) {
  return trpc.search.query.useInfiniteQuery(
    { ...filters, take },
    {
      getNextPageParam: (page) => page.nextCursor ?? undefined,
      enabled: filters.query.replace(/\s+/g, "").length >= 2,
      // Keep showing the previous results while the next query loads.
      placeholderData: (previous) => previous,
    },
  );
}
