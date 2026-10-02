"use client";

import { trpc } from "@/lib/trpc/api-client";

export function useWorkspaceList() {
  return trpc.workspace.listForUser.useQuery({
    cursor: undefined,
    take: 20,
  });
}

export function useCreateWorkspace() {
  const utils = trpc.useUtils();
  return trpc.workspace.create.useMutation({
    onSuccess: () => utils.workspace.listForUser.invalidate(),
  });
}

export function useWorkspaceDetail(workspaceId: string) {
  return trpc.workspace.getById.useQuery({ workspaceId }, { enabled: Boolean(workspaceId) });
}

export function useWorkspaceMembers(workspaceId: string) {
  return trpc.workspace.listMembers.useQuery(
    { workspaceId, cursor: undefined, take: 20 },
    { enabled: Boolean(workspaceId) },
  );
}
