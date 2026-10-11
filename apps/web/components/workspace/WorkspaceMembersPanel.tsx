"use client";

import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";

import { addWorkspaceMemberInputSchema, type AddWorkspaceMemberInput } from "@repo/validators/workspace";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspaceMembers } from "@/hooks/useWorkspaceMembers";
import { ErrorState, LoadingState } from "@/components/common/StateNotice";
import { UserAvatar } from "@/components/common/UserAvatar";
import { resolveUserIdentity } from "@/lib/user-identity";

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
  const mutationError = addMember.error ?? updateRole.error ?? removeMember.error ?? transferOwnership.error;

  const onSubmit = form.handleSubmit(async (values) => {
    await addMember.mutateAsync(values);
    form.reset({ workspaceId, userId: "", role: "MEMBER" });
  });

  if (members.isLoading) return <LoadingState label="Loading contributors..." />;
  if (members.error) return <ErrorState title="Unable to load workspace members" description={members.error.message} />;

  return (
    <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section aria-labelledby="roster-heading" className="min-w-0">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-[#dce6e0] pb-3">
          <div>
            <p className="text-xs font-semibold uppercase text-[#16765b]">People make the project</p>
            <h2 id="roster-heading" className="mt-1 text-lg font-semibold text-[#17231f]">Contributor roster</h2>
          </div>
          <span className="rounded-full bg-[#e6f2ec] px-3 py-1 text-xs font-semibold text-[#36584a]">
            {allMembers.length}{members.hasNextPage ? "+" : ""} {allMembers.length === 1 && !members.hasNextPage ? "person" : "people"}
          </span>
        </div>
        {mutationError ? <p role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{mutationError.message}</p> : null}
        {allMembers.length === 0 ? (
          <div className="rounded-md border border-dashed border-[#b8c9be] bg-white p-6 text-sm text-[#63716a]">No contributors to show yet.</div>
        ) : (
          <ul className="divide-y divide-[#dce6e0] rounded-md border border-[#dce6e0] bg-white px-4 sm:px-5">
            {allMembers.map((member) => {
              const identity = resolveUserIdentity(member.user);
              return (
              <li key={member.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
                <div className="flex min-w-0 items-center gap-3">
                  <UserAvatar name={identity.avatarName} className="size-10" />
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-[#17231f]">{identity.label}</p>
                    <p className="truncate text-sm text-[#63716a]">{member.user.email}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {canManage && member.role !== "OWNER" ? (
                    <select
                      className="rounded-md border border-[#cbd8d0] bg-white px-2.5 py-2 text-xs font-medium text-[#34443c]"
                      aria-label={`Role for ${identity.label}`}
                      value={member.role}
                      disabled={(!isOwner && member.role === "ADMIN") || updateRole.isPending}
                      onChange={(event) => updateRole.mutate({ workspaceId, userId: member.userId, role: event.target.value as "ADMIN" | "MEMBER" })}
                    >
                      <option value="MEMBER">Member</option>
                      <option value="ADMIN">Admin</option>
                    </select>
                  ) : (
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${member.role === "OWNER" ? "bg-[#fff3d5] text-[#785817]" : member.role === "ADMIN" ? "bg-[#f8e9e1] text-[#88442d]" : "bg-[#edf4ef] text-[#36584a]"}`}>
                      {member.role.charAt(0) + member.role.slice(1).toLowerCase()}
                    </span>
                  )}
                  {canManage && member.role !== "OWNER" ? (
                    <button
                      className="rounded-md px-2 py-2 text-xs font-semibold text-[#a33f37] hover:bg-red-50 disabled:opacity-50"
                      disabled={removeMember.isPending}
                      onClick={() => {
                        if (window.confirm(`Remove ${identity.label} from this workspace?`)) {
                          removeMember.mutate({ workspaceId, userId: member.userId });
                        }
                      }}
                    >
                      Remove
                    </button>
                  ) : null}
                  {isOwner && member.role !== "OWNER" ? (
                    <button
                      className="rounded-md px-2 py-2 text-xs font-semibold text-[#63716a] hover:bg-[#edf4ef] disabled:opacity-50"
                      disabled={transferOwnership.isPending}
                      onClick={() => {
                        if (window.confirm(`Transfer workspace ownership to ${identity.label}? You will become an admin.`)) {
                          transferOwnership.mutate({ workspaceId, newOwnerUserId: member.userId });
                        }
                      }}
                    >
                      Transfer ownership
                    </button>
                  ) : null}
                </div>
              </li>
              );
            })}
          </ul>
        )}
        {members.hasNextPage ? (
          <button className="mt-4 rounded-md border border-[#cbd8d0] bg-white px-4 py-2 text-sm font-semibold text-[#34443c] hover:bg-[#edf4ef] disabled:opacity-50" onClick={() => members.fetchNextPage()} disabled={members.isFetchingNextPage}>
            {members.isFetchingNextPage ? "Loading contributors..." : "Load more contributors"}
          </button>
        ) : null}
      </section>

      {canManage ? (
        <aside className="rounded-md border border-[#dce6e0] bg-white p-5">
          <p className="text-xs font-semibold uppercase text-[#b2603e]">Grow the circle</p>
          <h2 className="mt-2 text-lg font-semibold text-[#17231f]">Add an existing account</h2>
          <p className="mb-5 mt-1 text-sm leading-6 text-[#63716a]">Invitations are not available yet. Add a registered account by its user ID.</p>
          <form onSubmit={onSubmit} className="space-y-4">
            <label className="block space-y-1.5 text-sm font-medium text-[#34443c]">
              <span>User ID</span>
              <input className="w-full rounded-md border border-[#cbd8d0] px-3 py-2.5" placeholder="Paste account user ID" {...form.register("userId")} />
            </label>
            <label className="block space-y-1.5 text-sm font-medium text-[#34443c]">
              <span>Starting role</span>
              <select className="w-full rounded-md border border-[#cbd8d0] bg-white px-3 py-2.5" {...form.register("role")}>
                <option value="MEMBER">Member</option>
                <option value="ADMIN">Admin</option>
              </select>
            </label>
            {form.formState.errors.userId ? <p role="alert" className="text-sm text-red-700">{form.formState.errors.userId.message}</p> : null}
            <button className="w-full rounded-md bg-brand-action px-4 py-2.5 text-sm font-semibold text-on-brand-action hover:bg-brand-action-hover disabled:opacity-60" disabled={addMember.isPending}>
              {addMember.isPending ? "Adding..." : "Add contributor"}
            </button>
          </form>
        </aside>
      ) : (
        <aside className="rounded-md border border-[#dce6e0] bg-[#fffdf7] p-5">
          <p className="text-xs font-semibold uppercase text-[#b2603e]">Welcome aboard</p>
          <h2 className="mt-2 text-lg font-semibold text-[#17231f]">A workspace grows through conversation.</h2>
          <p className="mt-2 text-sm leading-6 text-[#63716a]">Ask a thoughtful question, share a useful update, or help another contributor find their next step.</p>
        </aside>
      )}
    </div>
  );
}
