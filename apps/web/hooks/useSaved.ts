"use client";

import { trpc } from "@/lib/trpc/api-client";

export type SavedTarget = { discussionId: string } | { commentId: string } | { decisionId: string };

export function useSavedIds(workspaceId: string) {
  return trpc.saved.idsInWorkspace.useQuery({ workspaceId }, { enabled: Boolean(workspaceId) });
}

export function useSavedList() {
  return trpc.saved.list.useInfiniteQuery({ take: 20 }, { getNextPageParam: (page) => page.nextCursor ?? undefined });
}

export function useSetSaved(workspaceId: string) {
  const utils = trpc.useUtils();
  return trpc.saved.set.useMutation({
    onSuccess: (data) => {
      utils.saved.idsInWorkspace.setData({ workspaceId }, data);
      void utils.saved.list.invalidate();
    },
  });
}

export function isSaved(ids: { discussionIds: string[]; commentIds: string[]; decisionIds: string[] } | undefined, target: SavedTarget) {
  if (!ids) return false;
  if ("discussionId" in target) return ids.discussionIds.includes(target.discussionId);
  if ("commentId" in target) return ids.commentIds.includes(target.commentId);
  return ids.decisionIds.includes(target.decisionId);
}
