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
    <li className="border-b border-[#dce6e0] py-5 first:border-t">
      {editing ? (
        <form onSubmit={onSubmit} className="space-y-3">
          <input className="w-full rounded-md border border-[#cbd8d0] bg-white px-3 py-2.5" aria-label="Discussion title" {...form.register("title")} />
          {update.error ? <p role="alert" className="text-sm text-red-700">{update.error.message}</p> : null}
          <div className="flex gap-3">
            <button disabled={update.isPending} className="text-sm font-semibold text-[#16765b]">{update.isPending ? "Saving..." : "Save"}</button>
            <button type="button" className="text-sm text-[#63716a]" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </form>
      ) : (
        <>
          <Link href={`/workspace/${workspaceId}/discussions/${discussion.id}`} className="group block">
            <div className="text-lg font-semibold text-[#17231f] group-hover:text-[#105d47]">{discussion.title}</div>
            <div className="mt-2 flex items-center gap-2 text-sm text-[#63716a]">
              <span className="grid size-7 place-items-center rounded-full bg-[#e6f2ec] text-xs font-semibold text-[#16765b]" aria-hidden="true">
                {(discussion.author.name ?? "?").slice(0, 1).toUpperCase()}
              </span>
              <span>{discussion.author.name ?? "Workspace member"}</span>
              <span aria-hidden="true">·</span>
              <span>Open discussion</span>
            </div>
          </Link>
          {isAuthor ? (
            <div className="mt-3 flex gap-4">
              <button className="text-sm font-medium text-[#16765b]" onClick={() => setEditing(true)}>Edit</button>
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
          className="mt-4 rounded-md border border-[#cbd8d0] bg-white px-4 py-2 text-sm font-medium text-[#34443c] hover:bg-[#edf4ef]"
          onClick={() => query.fetchNextPage()}
          disabled={query.isFetchingNextPage}
        >
          {query.isFetchingNextPage ? "Loading..." : "Load more"}
        </button>
      ) : null}
    </div>
  );
}
