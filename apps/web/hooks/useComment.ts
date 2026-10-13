"use client";

import { trpc } from "@/lib/trpc/api-client";

export function useCommentList(discussionId: string, parentCommentId?: string, enabled = true) {
  return trpc.comment.listByDiscussion.useInfiniteQuery(
    { discussionId, parentCommentId, take: 20 },
    { getNextPageParam: (page) => page.nextCursor ?? undefined, enabled: enabled && Boolean(discussionId) },
  );
}

export function useCommentActions(discussionId: string, workspaceId: string) {
  const utils = trpc.useUtils();
  const refresh = () => utils.comment.listByDiscussion.invalidate({ discussionId });
  const refreshAfterRejection = async (error: { data?: { code?: string } | null }) => {
    if (error.data?.code === "FORBIDDEN" || error.data?.code === "UNAUTHORIZED") {
      await Promise.allSettled([
        refresh(),
        utils.discussion.getById.invalidate({ discussionId }),
        utils.workspace.getById.invalidate({ workspaceId }),
        utils.workspace.listForUser.invalidate(),
      ]);
    } else if (error.data?.code === "NOT_FOUND") {
      await Promise.allSettled([refresh(), utils.discussion.getById.invalidate({ discussionId })]);
    }
  };
  const create = trpc.comment.create.useMutation({ onSuccess: refresh, onError: refreshAfterRejection });
  const update = trpc.comment.update.useMutation({
    onSuccess: async (comment) => {
      await Promise.all([refresh(), utils.comment.getById.invalidate({ commentId: comment.id })]);
    },
    onError: refreshAfterRejection,
  });
  const remove = trpc.comment.remove.useMutation({ onSuccess: refresh, onError: refreshAfterRejection });
  return { create, update, remove };
}
