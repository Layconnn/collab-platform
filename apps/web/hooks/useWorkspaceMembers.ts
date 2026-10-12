"use client";

import { trpc } from "@/lib/trpc/api-client";

export function useWorkspaceMembers(workspaceId: string, enabled = true) {
  const utils = trpc.useUtils();
  const members = trpc.workspace.listMembers.useInfiniteQuery(
    { workspaceId, take: 20 },
    {
      getNextPageParam: (page) => page.nextCursor ?? undefined,
      enabled: enabled && Boolean(workspaceId),
    },
  );
  const refresh = () =>
    Promise.all([
      utils.workspace.listMembers.invalidate({ workspaceId, take: 20 }),
      utils.workspace.listForUser.invalidate(),
      utils.workspace.getById.invalidate({ workspaceId }),
    ]);
  const addMember = trpc.workspace.addMember.useMutation({
    onSuccess: refresh,
  });
  const resolveMemberCandidate =
    trpc.workspace.resolveMemberCandidate.useMutation();
  const addMemberByUsername = trpc.workspace.addMemberByUsername.useMutation({
    onSuccess: refresh,
  });
  const updateRole = trpc.workspace.updateMemberRole.useMutation({
    onSuccess: refresh,
  });
  const removeMember = trpc.workspace.removeMember.useMutation({
    onSuccess: refresh,
  });
  const transferOwnership = trpc.workspace.transferOwnership.useMutation({
    onSuccess: refresh,
  });

  return {
    members,
    addMember,
    resolveMemberCandidate,
    addMemberByUsername,
    updateRole,
    removeMember,
    transferOwnership,
  };
}
