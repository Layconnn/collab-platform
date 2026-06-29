"use client";

import { trpc } from "@/lib/trpc/api-client";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/StateNotice";

export function CommentList({ discussionId }: { discussionId: string }) {
  const query = trpc.comment.listByDiscussion.useInfiniteQuery(
    { discussionId, take: 20 },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    },
  );

  if (query.isLoading) {
    return <LoadingState label="Loading comments..." />;
  }

  if (query.error) {
    return <ErrorState title="Failed to load comments" description={query.error.message} />;
  }

  const items = query.data?.pages.flatMap((page) => page.items) ?? [];

  if (items.length === 0) {
    return <EmptyState title="No comments yet" description="Start the conversation." />;
  }

  return (
    <div className="space-y-4">
      <ul className="space-y-3">
        {items.map((comment) => (
          <li key={comment.id} className="rounded border border-slate-200 p-3">
            <div className="text-sm text-slate-700">{comment.body}</div>
            <div className="text-xs text-slate-500">{comment.author?.name ?? "Unknown"}</div>
          </li>
        ))}
      </ul>
      {query.hasNextPage ? (
        <button
          className="text-sm text-teal-600"
          onClick={() => query.fetchNextPage()}
          disabled={query.isFetchingNextPage}
        >
          {query.isFetchingNextPage ? "Loading..." : "Load more"}
        </button>
      ) : null}
    </div>
  );
}
