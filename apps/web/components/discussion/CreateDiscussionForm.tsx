"use client";

import { Button, FormControl, FormLabel, Input, Textarea } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import {
  createDiscussionInputSchema,
  type CreateDiscussionInput,
} from "@repo/validators/discussion";

import { trpc } from "@/lib/trpc/api-client";

export function CreateDiscussionForm({ workspaceId }: { workspaceId: string }) {
  const form = useForm<CreateDiscussionInput>({
    resolver: zodResolver(createDiscussionInputSchema),
    defaultValues: { workspaceId, title: "", body: "" },
  });

  const createDiscussion = trpc.discussion.create.useMutation();

  const onSubmit = form.handleSubmit(async (values) => {
    await createDiscussion.mutateAsync(values);
    form.reset({ workspaceId, title: "", body: "" });
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <FormControl>
        <FormLabel>Title</FormLabel>
        <Input {...form.register("title")} />
      </FormControl>
      <FormControl>
        <FormLabel>Body</FormLabel>
        <Textarea {...form.register("body")} />
      </FormControl>
      <Button type="submit" colorScheme="teal" isLoading={createDiscussion.isPending}>
        Create Discussion
      </Button>
    </form>
  );
}
