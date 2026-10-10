"use client";

import Link from "next/link";
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
    <div className="mx-auto max-w-3xl space-y-8">
      <Link href={`/workspace/${discussion.data.workspaceId}/discussions`} className="inline-flex text-sm font-medium text-[#16765b] hover:text-[#105d47]">&lt;- All discussions</Link>
      <article className="border-b border-[#dce6e0] pb-8">
        <p className="text-sm font-semibold text-[#16765b]">Community discussion</p>
        <h1 className="mt-2 text-3xl font-semibold leading-tight text-[#17231f]">{discussion.data.title}</h1>
        <div className="mt-4 flex items-center gap-2 text-sm text-[#63716a]">
          <span className="grid size-8 place-items-center rounded-full bg-[#e6f2ec] text-xs font-semibold text-[#16765b]" aria-hidden="true">
            {(discussion.data.author?.name ?? "?").slice(0, 1).toUpperCase()}
          </span>
          <span>{discussion.data.author?.name ?? "Community member"}</span>
          <span aria-hidden="true">started this conversation</span>
        </div>
        <p className="mt-6 whitespace-pre-wrap text-base leading-7 text-[#34443c]">{discussion.data.body}</p>
      </article>
      <section aria-labelledby="comments-heading">
        <h2 id="comments-heading" className="mb-5 text-lg font-semibold text-[#17231f]">Conversation</h2>
        <CommentList discussionId={discussionId} />
      </section>
      <section className="border-t border-[#dce6e0] pt-6">
        <h2 className="mb-4 text-base font-semibold text-[#17231f]">Add your perspective</h2>
        <CreateCommentForm discussionId={discussionId} />
      </section>
    </div>
  );
}
