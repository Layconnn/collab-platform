"use client";

import { trpc } from "@/lib/trpc/api-client";

export function useWorkspaceList(enabled = true) {
  return trpc.workspace.listForUser.useQuery({
    cursor: undefined,
    take: 20,
  }, { enabled });
}

export function useWorkspaceSwitcherList(enabled = true) {
  return trpc.workspace.listForUser.useInfiniteQuery(
    { take: 20 },
    { getNextPageParam: (page) => page.nextCursor ?? undefined, enabled },
  );
}

export function useCreateWorkspace() {
  const utils = trpc.useUtils();
  return trpc.workspace.create.useMutation({
    onSuccess: () => utils.workspace.listForUser.invalidate(),
  });
}

export function useWorkspaceDetail(workspaceId: string, enabled = true) {
  return trpc.workspace.getById.useQuery({ workspaceId }, { enabled: enabled && Boolean(workspaceId) });
}

export function useWorkspaceMembers(workspaceId: string) {
  return trpc.workspace.listMembers.useQuery(
    { workspaceId, cursor: undefined, take: 20 },
    { enabled: Boolean(workspaceId) },
  );
}
