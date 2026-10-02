"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { inferRouterOutputs } from "@trpc/server";

import { updateCommentInputSchema, type UpdateCommentInput } from "@repo/validators/comment";
import { useAuth } from "@/hooks/useAuth";
import { useCommentActions, useCommentList } from "@/hooks/useComment";
import type { AppRouter } from "@/server/api/root";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/StateNotice";
import { CreateCommentForm } from "@/components/comment/CreateCommentForm";

type CommentItem = inferRouterOutputs<AppRouter>["comment"]["listByDiscussion"]["items"][number];

function CommentThread({ comment, discussionId }: { comment: CommentItem; discussionId: string }) {
  const { user } = useAuth();
  const { update, remove } = useCommentActions();
  const [showReplies, setShowReplies] = useState(false);
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const replies = useCommentList(discussionId, comment.id, showReplies);
  const form = useForm<UpdateCommentInput>({
    resolver: zodResolver(updateCommentInputSchema),
    defaultValues: { commentId: comment.id, body: comment.body },
  });
  const isAuthor = user?.id === comment.author.id;

  const onSubmit = form.handleSubmit(async (values) => {
    await update.mutateAsync(values);
    setEditing(false);
  });

  return (
    <li className="border-l-2 border-slate-200 pl-4">
      <article className="rounded border border-slate-200 bg-white p-3">
        {editing ? (
          <form onSubmit={onSubmit} className="space-y-3">
            <textarea className="w-full rounded border border-slate-300 px-3 py-2" rows={3} aria-label="Edit comment" {...form.register("body")} />
            {update.error ? <p role="alert" className="text-sm text-red-700">{update.error.message}</p> : null}
            <div className="flex gap-3">
              <button disabled={update.isPending} className="text-sm font-medium text-teal-800">Save</button>
              <button type="button" className="text-sm text-slate-600" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </form>
        ) : (
          <>
            <p className="whitespace-pre-wrap text-sm text-slate-700">{comment.body}</p>
            <p className="mt-2 text-xs text-slate-500">{comment.author.name ?? "Unknown"}</p>
            <div className="mt-3 flex flex-wrap gap-4">
              {comment.depth < 8 ? (
                <button className="text-xs font-medium text-teal-800" onClick={() => { setShowReplies(true); setReplying((value) => !value); }}>
                  Reply
                </button>
              ) : null}
              <button className="text-xs font-medium text-slate-700" onClick={() => setShowReplies((value) => !value)}>
                {showReplies ? "Hide replies" : "Show replies"}
              </button>
              {isAuthor ? <button className="text-xs font-medium text-teal-800" onClick={() => setEditing(true)}>Edit</button> : null}
              {isAuthor ? (
                <button className="text-xs font-medium text-red-700" onClick={() => {
                  if (window.confirm("Delete this comment and its replies?")) remove.mutate({ commentId: comment.id });
                }}>Delete</button>
              ) : null}
            </div>
            {remove.error ? <p role="alert" className="mt-2 text-sm text-red-700">{remove.error.message}</p> : null}
          </>
        )}
      </article>
      {replying ? (
        <div className="mt-3">
          <CreateCommentForm discussionId={discussionId} parentCommentId={comment.id} />
        </div>
      ) : null}
      {showReplies ? (
        <div className="mt-3">
          {replies.isLoading ? <LoadingState label="Loading replies..." /> : null}
          {replies.error ? <ErrorState title="Could not load replies" description={replies.error.message} /> : null}
          <ul className="mt-3 space-y-3">
            {replies.data?.pages.flatMap((page) => page.items).map((reply) => (
              <CommentThread key={reply.id} comment={reply} discussionId={discussionId} />
            ))}
          </ul>
          {replies.hasNextPage ? (
            <button className="mt-3 text-sm font-medium text-teal-800" onClick={() => replies.fetchNextPage()} disabled={replies.isFetchingNextPage}>
              {replies.isFetchingNextPage ? "Loading..." : "Load more replies"}
            </button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export function CommentList({ discussionId }: { discussionId: string }) {
  const query = useCommentList(discussionId);

  if (query.isLoading) return <LoadingState label="Loading comments..." />;
  if (query.error) return <ErrorState title="Failed to load comments" description={query.error.message} />;

  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  if (items.length === 0) return <EmptyState title="No comments yet" description="Start the conversation." />;

  return (
    <div className="space-y-4">
      <ul className="space-y-4">
        {items.map((comment) => <CommentThread key={comment.id} comment={comment} discussionId={discussionId} />)}
      </ul>
      {query.hasNextPage ? (
        <button className="text-sm font-medium text-teal-800" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>
          {query.isFetchingNextPage ? "Loading..." : "Load more comments"}
        </button>
      ) : null}
    </div>
  );
}
