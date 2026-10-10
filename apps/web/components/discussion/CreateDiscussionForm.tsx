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
      <label className="block space-y-1.5 text-sm font-medium text-[#34443c]">
        <span>Title</span>
        <input className="w-full rounded-md border border-[#cbd8d0] bg-white px-3 py-2.5 text-[#17231f] placeholder:text-[#89958f]" placeholder="What would you like to discuss?" {...form.register("title")} />
      </label>
      <label className="block space-y-1.5 text-sm font-medium text-[#34443c]">
        <span>Body</span>
        <textarea className="w-full rounded-md border border-[#cbd8d0] bg-white px-3 py-2.5 text-[#17231f] placeholder:text-[#89958f]" placeholder="Add context so others can jump in." rows={5} {...form.register("body")} />
      </label>
      {createDiscussion.error ? <p role="alert" className="text-sm text-red-700">{createDiscussion.error.message}</p> : null}
      <button type="submit" disabled={createDiscussion.isPending} className="rounded-md bg-brand-action px-4 py-2.5 text-sm font-semibold text-on-brand-action transition-colors hover:bg-brand-action-hover disabled:opacity-60">
        {createDiscussion.isPending ? "Posting..." : "Post discussion"}
      </button>
    </form>
  );
}
