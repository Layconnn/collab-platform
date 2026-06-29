"use client";

import Link from "next/link";

import { trpc } from "@/lib/trpc/api-client";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/StateNotice";

export function DiscussionList({ workspaceId }: { workspaceId: string }) {
  const query = trpc.discussion.listByWorkspace.useInfiniteQuery(
    { workspaceId, take: 20 },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    },
  );

  if (query.isLoading) {
    return <LoadingState label="Loading discussions..." />;
  }

  if (query.error) {
    return <ErrorState title="Failed to load discussions" description={query.error.message} />;
  }

  const items = query.data?.pages.flatMap((page) => page.items) ?? [];

  if (items.length === 0) {
    return <EmptyState title="No discussions yet" description="Start the first discussion." />;
  }

  return (
    <div className="space-y-4">
      <ul className="space-y-3">
        {items.map((discussion) => (
          <li key={discussion.id} className="rounded border border-slate-200 p-4">
            <Link href={`/workspace/${workspaceId}/discussions/${discussion.id}`}>
              <div className="text-base font-semibold text-slate-900">{discussion.title}</div>
              <div className="text-xs text-slate-500">{discussion.author?.name ?? "Unknown"}</div>
            </Link>
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
