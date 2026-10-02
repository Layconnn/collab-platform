"use client";

import { trpc } from "@/lib/trpc/api-client";

export function useCommentList(discussionId: string, parentCommentId?: string, enabled = true) {
  return trpc.comment.listByDiscussion.useInfiniteQuery(
    { discussionId, parentCommentId, take: 20 },
    { getNextPageParam: (page) => page.nextCursor ?? undefined, enabled: enabled && Boolean(discussionId) },
  );
}

export function useCommentActions() {
  const utils = trpc.useUtils();
  const refresh = () => utils.comment.listByDiscussion.invalidate();
  const create = trpc.comment.create.useMutation({ onSuccess: refresh });
  const update = trpc.comment.update.useMutation({
    onSuccess: async (comment) => {
      await Promise.all([refresh(), utils.comment.getById.invalidate({ commentId: comment.id })]);
    },
  });
  const remove = trpc.comment.remove.useMutation({ onSuccess: refresh });
  return { create, update, remove };
}
