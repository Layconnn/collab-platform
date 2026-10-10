"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { createCommentInputSchema, type CreateCommentInput } from "@repo/validators/comment";

import { useCommentActions } from "@/hooks/useComment";

export function CreateCommentForm({ discussionId, parentCommentId }: { discussionId: string; parentCommentId?: string }) {
  const form = useForm<CreateCommentInput>({
    resolver: zodResolver(createCommentInputSchema),
    defaultValues: { discussionId, parentCommentId, body: "" },
  });

  const { create: createComment } = useCommentActions();

  const onSubmit = form.handleSubmit(async (values) => {
    await createComment.mutateAsync(values);
    form.reset({ discussionId, parentCommentId, body: "" });
  });

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <label className="block space-y-1.5 text-sm font-medium text-[#34443c]">
        <span>Comment</span>
        <textarea className="w-full rounded-md border border-[#cbd8d0] bg-white px-3 py-2.5 text-[#17231f] placeholder:text-[#89958f]" placeholder="Be kind, constructive, and specific." rows={4} {...form.register("body")} />
      </label>
      {createComment.error ? <p role="alert" className="text-sm text-red-700">{createComment.error.message}</p> : null}
      <button type="submit" disabled={createComment.isPending} className="rounded-md bg-brand-action px-4 py-2.5 text-sm font-semibold text-on-brand-action transition-colors hover:bg-brand-action-hover disabled:opacity-60">
        {createComment.isPending ? "Posting..." : "Post comment"}
      </button>
    </form>
  );
}
