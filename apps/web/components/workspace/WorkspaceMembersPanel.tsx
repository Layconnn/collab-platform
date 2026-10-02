"use client";

import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";

import { addWorkspaceMemberInputSchema, type AddWorkspaceMemberInput } from "@repo/validators/workspace";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspaceMembers } from "@/hooks/useWorkspaceMembers";
import { ErrorState, LoadingState } from "@/components/common/StateNotice";

export function WorkspaceMembersPanel({ workspaceId }: { workspaceId: string }) {
  const { user } = useAuth();
  const { members, addMember, updateRole, removeMember, transferOwnership } = useWorkspaceMembers(workspaceId);
  const allMembers = useMemo(() => members.data?.pages.flatMap((page) => page.items) ?? [], [members.data]);
  const currentRole = allMembers.find((member) => member.userId === user?.id)?.role;
  const canManage = currentRole === "OWNER" || currentRole === "ADMIN";
  const isOwner = currentRole === "OWNER";
  const form = useForm<z.input<typeof addWorkspaceMemberInputSchema>, unknown, AddWorkspaceMemberInput>({
    resolver: zodResolver(addWorkspaceMemberInputSchema),
    defaultValues: { workspaceId, userId: "", role: "MEMBER" },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    await addMember.mutateAsync(values);
    form.reset({ workspaceId, userId: "", role: "MEMBER" });
  });

  if (members.isLoading) return <LoadingState label="Loading members..." />;
  if (members.error) return <ErrorState title="Unable to load workspace members" description={members.error.message} />;

  return (
    <div className="space-y-6">
      <ul className="divide-y divide-slate-200 rounded border border-slate-200 bg-white">
        {allMembers.map((member) => (
          <li key={member.id} className="flex flex-wrap items-center justify-between gap-4 p-4">
            <div>
              <p className="font-medium text-slate-900">{member.user.name || member.user.email}</p>
              <p className="text-sm text-slate-600">{member.user.email} · {member.role}</p>
            </div>
            {canManage && member.role !== "OWNER" ? (
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className="rounded border border-slate-300 px-2 py-1 text-sm"
                  aria-label={`Role for ${member.user.email}`}
                  value={member.role}
                  disabled={!isOwner && member.role === "ADMIN"}
                  onChange={(event) => updateRole.mutate({ workspaceId, userId: member.userId, role: event.target.value as "ADMIN" | "MEMBER" })}
                >
                  <option value="MEMBER">Member</option>
                  <option value="ADMIN">Admin</option>
                </select>
                {isOwner ? (
                  <button className="text-sm font-medium text-teal-800" onClick={() => transferOwnership.mutate({ workspaceId, newOwnerUserId: member.userId })}>
                    Transfer ownership
                  </button>
                ) : null}
                <button className="text-sm font-medium text-red-700" onClick={() => removeMember.mutate({ workspaceId, userId: member.userId })}>
                  Remove
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {members.hasNextPage ? (
        <button className="text-sm font-medium text-teal-800" onClick={() => members.fetchNextPage()} disabled={members.isFetchingNextPage}>
          {members.isFetchingNextPage ? "Loading..." : "Load more members"}
        </button>
      ) : null}
      {canManage ? (
        <form onSubmit={onSubmit} className="max-w-xl space-y-4 rounded border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-900">Add an existing account</h2>
          <label className="block space-y-1 text-sm font-medium text-slate-700">
            <span>User ID</span>
            <input className="w-full rounded border border-slate-300 px-3 py-2" {...form.register("userId")} />
          </label>
          <label className="block space-y-1 text-sm font-medium text-slate-700">
            <span>Role</span>
            <select className="w-full rounded border border-slate-300 px-3 py-2" {...form.register("role")}>
              <option value="MEMBER">Member</option>
              <option value="ADMIN">Admin</option>
            </select>
          </label>
          {addMember.error ? <p role="alert" className="text-sm text-red-700">{addMember.error.message}</p> : null}
          <button className="rounded bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" disabled={addMember.isPending}>
            {addMember.isPending ? "Adding..." : "Add member"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
