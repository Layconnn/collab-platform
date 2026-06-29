"use client";

import { Button, FormControl, FormLabel, Textarea } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { createCommentInputSchema, type CreateCommentInput } from "@repo/validators/comment";

import { trpc } from "@/lib/trpc/api-client";

export function CreateCommentForm({ discussionId }: { discussionId: string }) {
  const form = useForm<CreateCommentInput>({
    resolver: zodResolver(createCommentInputSchema),
    defaultValues: { discussionId, body: "" },
  });

  const createComment = trpc.comment.create.useMutation();

  const onSubmit = form.handleSubmit(async (values) => {
    await createComment.mutateAsync(values);
    form.reset({ discussionId, body: "" });
  });

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <FormControl>
        <FormLabel>Comment</FormLabel>
        <Textarea {...form.register("body")} />
      </FormControl>
      <Button type="submit" colorScheme="teal" isLoading={createComment.isPending}>
        Post Comment
      </Button>
    </form>
  );
}
