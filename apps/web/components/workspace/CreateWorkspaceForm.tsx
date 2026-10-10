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
      <label className="block space-y-1.5 text-sm font-medium text-[#34443c]">
        <span>Workspace name</span>
        <input className="w-full rounded-md border border-[#cbd8d0] bg-white px-3 py-2.5 text-[#17231f] placeholder:text-[#89958f]" placeholder="e.g. Aurora project" {...form.register("name")} />
      </label>
      <label className="block space-y-1.5 text-sm font-medium text-[#34443c]">
        <span>Workspace slug</span>
        <input className="w-full rounded-md border border-[#cbd8d0] bg-white px-3 py-2.5 text-[#17231f] placeholder:text-[#89958f]" placeholder="aurora-project" {...form.register("slug")} />
      </label>
      {createWorkspace.error ? <p role="alert" className="text-sm text-red-700">{createWorkspace.error.message}</p> : null}
      <button type="submit" disabled={createWorkspace.isPending} className="w-full rounded-md bg-[#16765b] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#105d47] disabled:opacity-60">
        {createWorkspace.isPending ? "Creating..." : "Create community"}
      </button>
    </form>
  );
}
