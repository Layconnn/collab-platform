"use client";

import type { ActivityFilter } from "@repo/validators/activity";

import { trpc } from "@/lib/trpc/api-client";

export function useWorkspaceActivity(workspaceId: string, filter: ActivityFilter) {
  return trpc.activity.listByWorkspace.useInfiniteQuery(
    { workspaceId, filter, take: 15 },
    { getNextPageParam: (page) => page.nextCursor ?? undefined, enabled: Boolean(workspaceId) },
  );
}
