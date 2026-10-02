"use client";

import { trpc } from "@/lib/trpc/api-client";

export function useWorkspaceMembers(workspaceId: string) {
  const utils = trpc.useUtils();
  const members = trpc.workspace.listMembers.useInfiniteQuery(
    { workspaceId, take: 20 },
    { getNextPageParam: (page) => page.nextCursor ?? undefined, enabled: Boolean(workspaceId) },
  );
  const refresh = () => utils.workspace.listMembers.invalidate({ workspaceId, take: 20 });
  const addMember = trpc.workspace.addMember.useMutation({ onSuccess: refresh });
  const updateRole = trpc.workspace.updateMemberRole.useMutation({ onSuccess: refresh });
  const removeMember = trpc.workspace.removeMember.useMutation({ onSuccess: refresh });
  const transferOwnership = trpc.workspace.transferOwnership.useMutation({ onSuccess: refresh });

  return { members, addMember, updateRole, removeMember, transferOwnership };
}
