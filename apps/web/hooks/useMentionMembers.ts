"use client";

import { trpc } from "@/lib/trpc/api-client";

export function useMentionMembers(workspaceId: string, query: string, enabled: boolean) {
  return trpc.workspace.searchMentionMembers.useQuery(
    { workspaceId, query },
    { enabled: enabled && Boolean(workspaceId), staleTime: 0, refetchOnWindowFocus: true },
  );
}
