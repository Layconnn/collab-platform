"use client";

import { trpc } from "@/lib/trpc/api-client";

export function usePinnedReplies(workspaceId: string, discussionId: string) {
  return trpc.pin.list.useQuery({ workspaceId, discussionId }, { enabled: Boolean(workspaceId && discussionId) });
}

export function useSetPin(workspaceId: string, discussionId: string) {
  const utils = trpc.useUtils();
  return trpc.pin.set.useMutation({
    onSuccess: (data) => {
      utils.pin.list.setData({ workspaceId, discussionId }, data);
      void utils.activity.listByWorkspace.invalidate({ workspaceId });
    },
  });
}
