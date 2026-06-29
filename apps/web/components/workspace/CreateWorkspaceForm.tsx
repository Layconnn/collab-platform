"use client";

import { Button, FormControl, FormLabel, Input } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { createWorkspaceInputSchema, type CreateWorkspaceInput } from "@repo/validators/workspace";

import { trpc } from "@/lib/trpc/api-client";

export function CreateWorkspaceForm() {
  const form = useForm<CreateWorkspaceInput>({
    resolver: zodResolver(createWorkspaceInputSchema),
    defaultValues: { name: "", slug: "" },
  });
  const createWorkspace = trpc.workspace.create.useMutation();

  const onSubmit = form.handleSubmit(async (values) => {
    await createWorkspace.mutateAsync(values);
    form.reset();
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <FormControl>
        <FormLabel>Workspace Name</FormLabel>
        <Input {...form.register("name")} />
      </FormControl>
      <FormControl>
        <FormLabel>Workspace Slug</FormLabel>
        <Input {...form.register("slug")} />
      </FormControl>
      <Button type="submit" colorScheme="teal" isLoading={createWorkspace.isPending}>
        Create Workspace
      </Button>
    </form>
  );
}
