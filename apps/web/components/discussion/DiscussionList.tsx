"use client";

import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { inferRouterOutputs } from "@trpc/server";

import { useDiscussionList } from "@/hooks/useDiscussion";
import { useDiscussionActions } from "@/hooks/useDiscussion";
import { useAuth } from "@/hooks/useAuth";
import { updateDiscussionInputSchema, type UpdateDiscussionInput } from "@repo/validators/discussion";
import type { AppRouter } from "@/server/api/root";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/StateNotice";

type DiscussionItem = inferRouterOutputs<AppRouter>["discussion"]["listByWorkspace"]["items"][number];

function DiscussionEntry({ discussion, workspaceId }: { discussion: DiscussionItem; workspaceId: string }) {
  const { user } = useAuth();
  const { update, remove } = useDiscussionActions(workspaceId);
  const [editing, setEditing] = useState(false);
  const form = useForm<UpdateDiscussionInput>({
    resolver: zodResolver(updateDiscussionInputSchema),
    defaultValues: { discussionId: discussion.id, title: discussion.title },
  });
  const isAuthor = user?.id === discussion.author.id;

  const onSubmit = form.handleSubmit(async (values) => {
    await update.mutateAsync(values);
    setEditing(false);
  });

  return (
    <li className="rounded border border-slate-200 p-4">
      {editing ? (
        <form onSubmit={onSubmit} className="space-y-3">
          <input className="w-full rounded border border-slate-300 px-3 py-2" aria-label="Discussion title" {...form.register("title")} />
          {update.error ? <p role="alert" className="text-sm text-red-700">{update.error.message}</p> : null}
          <div className="flex gap-3">
            <button disabled={update.isPending} className="text-sm font-medium text-teal-800">Save</button>
            <button type="button" className="text-sm text-slate-600" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </form>
      ) : (
        <>
          <Link href={`/workspace/${workspaceId}/discussions/${discussion.id}`}>
            <div className="text-base font-semibold text-slate-900">{discussion.title}</div>
            <div className="text-xs text-slate-500">{discussion.author.name ?? "Unknown"}</div>
          </Link>
          {isAuthor ? (
            <div className="mt-3 flex gap-4">
              <button className="text-sm font-medium text-teal-800" onClick={() => setEditing(true)}>Edit</button>
              <button className="text-sm font-medium text-red-700" onClick={() => {
                if (window.confirm("Delete this discussion and its comments?")) remove.mutate({ discussionId: discussion.id });
              }}>Delete</button>
              {remove.error ? <span role="alert" className="text-sm text-red-700">{remove.error.message}</span> : null}
            </div>
          ) : null}
        </>
      )}
    </li>
  );
}

export function DiscussionList({ workspaceId }: { workspaceId: string }) {
  const query = useDiscussionList(workspaceId);

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
          <DiscussionEntry key={discussion.id} discussion={discussion} workspaceId={workspaceId} />
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
