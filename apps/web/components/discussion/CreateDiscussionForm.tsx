"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import {
  createDiscussionInputSchema,
  type CreateDiscussionInput,
} from "@repo/validators/discussion";

import { useDiscussionActions } from "@/hooks/useDiscussion";

export function CreateDiscussionForm({ workspaceId }: { workspaceId: string }) {
  const form = useForm<CreateDiscussionInput>({
    resolver: zodResolver(createDiscussionInputSchema),
    defaultValues: { workspaceId, title: "", body: "" },
  });

  const { create: createDiscussion } = useDiscussionActions(workspaceId);

  const onSubmit = form.handleSubmit(async (values) => {
    await createDiscussion.mutateAsync(values);
    form.reset({ workspaceId, title: "", body: "" });
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block space-y-1 text-sm font-medium text-slate-700">
        <span>Title</span>
        <input className="w-full rounded border border-slate-300 px-3 py-2" {...form.register("title")} />
      </label>
      <label className="block space-y-1 text-sm font-medium text-slate-700">
        <span>Body</span>
        <textarea className="w-full rounded border border-slate-300 px-3 py-2" rows={5} {...form.register("body")} />
      </label>
      <button type="submit" disabled={createDiscussion.isPending} className="rounded bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
        Create Discussion
      </button>
    </form>
  );
}
