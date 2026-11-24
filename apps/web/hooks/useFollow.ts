"use client";

import { trpc } from "@/lib/trpc/api-client";

export function useDiscussionFollow(workspaceId: string, discussionId: string) {
  const utils = trpc.useUtils();
  const key = { workspaceId, discussionId };
  const follow = trpc.follow.get.useQuery(key, { enabled: Boolean(workspaceId && discussionId) });
  const set = trpc.follow.set.useMutation({ onSuccess: (data) => utils.follow.get.setData(key, data) });
  return { follow, set };
}
