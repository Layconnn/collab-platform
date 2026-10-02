"use client";

import { useParams } from "next/navigation";

import { useDiscussionDetail } from "@/hooks/useDiscussion";
import { LoadingState, ErrorState } from "@/components/common/StateNotice";
import { CommentList } from "@/components/comment/CommentList";
import { CreateCommentForm } from "@/components/comment/CreateCommentForm";

export default function DiscussionDetailPage() {
  const params = useParams<{ discussionId: string }>();
  const discussionId = params.discussionId;
  const discussion = useDiscussionDetail(discussionId);

  if (discussion.isLoading) {
    return <LoadingState label="Loading discussion..." />;
  }

  if (discussion.error || !discussion.data) {
    return <ErrorState title="Discussion not found" description={discussion.error?.message} />;
  }

  return (
    <div className="space-y-6">
      <div className="rounded border border-slate-200 bg-white p-6">
        <h1 className="text-2xl font-semibold text-slate-900">{discussion.data.title}</h1>
        <p className="mt-3 text-sm text-slate-700">{discussion.data.body}</p>
        <p className="mt-2 text-xs text-slate-500">
          {discussion.data.author?.name ?? "Unknown"}
        </p>
      </div>
      <div className="rounded border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold text-slate-800">Comments</h2>
        <CommentList discussionId={discussionId} />
      </div>
      <div className="rounded border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold text-slate-800">Add a comment</h2>
        <CreateCommentForm discussionId={discussionId} />
      </div>
    </div>
  );
}
