"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { createWorkspaceInputSchema, type CreateWorkspaceInput } from "@repo/validators/workspace";

import { useCreateWorkspace } from "@/hooks/useWorkspace";

export function CreateWorkspaceForm() {
  const form = useForm<CreateWorkspaceInput>({
    resolver: zodResolver(createWorkspaceInputSchema),
    defaultValues: { name: "", slug: "" },
  });
  const createWorkspace = useCreateWorkspace();

  const onSubmit = form.handleSubmit(async (values) => {
    await createWorkspace.mutateAsync(values);
    form.reset();
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block space-y-1 text-sm font-medium text-slate-700">
        <span>Workspace name</span>
        <input className="w-full rounded border border-slate-300 px-3 py-2" {...form.register("name")} />
      </label>
      <label className="block space-y-1 text-sm font-medium text-slate-700">
        <span>Workspace slug</span>
        <input className="w-full rounded border border-slate-300 px-3 py-2" {...form.register("slug")} />
      </label>
      <button type="submit" disabled={createWorkspace.isPending} className="rounded bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
        Create Workspace
      </button>
    </form>
  );
}
