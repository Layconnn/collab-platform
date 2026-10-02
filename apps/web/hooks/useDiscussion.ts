"use client";

import { trpc } from "@/lib/trpc/api-client";

export function useDiscussionList(workspaceId: string) {
  return trpc.discussion.listByWorkspace.useInfiniteQuery(
    { workspaceId, take: 20 },
    { getNextPageParam: (page) => page.nextCursor ?? undefined, enabled: Boolean(workspaceId) },
  );
}

export function useDiscussionDetail(discussionId: string) {
  return trpc.discussion.getById.useQuery({ discussionId }, { enabled: Boolean(discussionId) });
}

export function useDiscussionActions(workspaceId: string) {
  const utils = trpc.useUtils();
  const refreshList = () => utils.discussion.listByWorkspace.invalidate({ workspaceId, take: 20 });
  const create = trpc.discussion.create.useMutation({ onSuccess: refreshList });
  const update = trpc.discussion.update.useMutation({
    onSuccess: async (discussion) => {
      await Promise.all([
        refreshList(),
        utils.discussion.getById.invalidate({ discussionId: discussion.id }),
      ]);
    },
  });
  const remove = trpc.discussion.remove.useMutation({ onSuccess: refreshList });
  return { create, update, remove };
}
