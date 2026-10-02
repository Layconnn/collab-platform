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
      <label className="block space-y-1 text-sm font-medium text-slate-700">
        <span>Comment</span>
        <textarea className="w-full rounded border border-slate-300 px-3 py-2" rows={3} {...form.register("body")} />
      </label>
      <button type="submit" disabled={createComment.isPending} className="rounded bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
        Post Comment
      </button>
    </form>
  );
}
