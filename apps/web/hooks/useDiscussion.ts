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
  const refreshAfterRejection = async (error: { data?: { code?: string } | null }) => {
    if (error.data?.code === "FORBIDDEN" || error.data?.code === "UNAUTHORIZED") {
      await Promise.allSettled([
        refreshList(),
        utils.workspace.getById.invalidate({ workspaceId }),
        utils.workspace.listForUser.invalidate(),
      ]);
    } else if (error.data?.code === "NOT_FOUND") {
      await Promise.allSettled([refreshList()]);
    }
  };
  const create = trpc.discussion.create.useMutation({ onSuccess: refreshList });
  const update = trpc.discussion.update.useMutation({
    onSuccess: async (discussion) => {
      await Promise.all([
        refreshList(),
        utils.discussion.getById.invalidate({ discussionId: discussion.id }),
      ]);
    },
    onError: refreshAfterRejection,
  });
  const remove = trpc.discussion.remove.useMutation({ onSuccess: refreshList, onError: refreshAfterRejection });
  return { create, update, remove };
}
