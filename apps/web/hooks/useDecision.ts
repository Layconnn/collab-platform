"use client";

import { trpc } from "@/lib/trpc/api-client";

export function useDecisionList(workspaceId: string, status?: "PROPOSED" | "DECIDED" | "SUPERSEDED", waitingForMe = false) {
  return trpc.decision.listByWorkspace.useInfiniteQuery(
    { workspaceId, status, take: 20, ...(waitingForMe ? { waitingForMe } : {}) },
    { getNextPageParam: (page) => page.nextCursor ?? undefined, enabled: Boolean(workspaceId) },
  );
}

export function useDecisionDetail(workspaceId: string, decisionId: string) {
  return trpc.decision.getById.useQuery({ workspaceId, decisionId }, { enabled: Boolean(workspaceId && decisionId) });
}

export function useDecisionRevisions(workspaceId: string, decisionId: string, enabled = true) {
  return trpc.decision.revisions.useInfiniteQuery(
    { workspaceId, decisionId, take: 20 },
    { getNextPageParam: (page) => page.nextCursor ?? undefined, enabled: enabled && Boolean(workspaceId && decisionId) },
  );
}

export function useReplacementHistory(workspaceId: string, decisionId: string, enabled = true) {
  return trpc.decision.replacementHistory.useQuery(
    { workspaceId, decisionId },
    { enabled: enabled && Boolean(workspaceId && decisionId) },
  );
}

export function useReplacementCandidates(workspaceId: string, oldDecisionId: string, enabled: boolean) {
  return trpc.decision.replacementCandidates.useInfiniteQuery(
    { workspaceId, oldDecisionId, take: 20 },
    { getNextPageParam: (page) => page.nextCursor ?? undefined, enabled: enabled && Boolean(workspaceId && oldDecisionId) },
  );
}

export function useDecisionActions(workspaceId: string) {
  const utils = trpc.useUtils();
  const refresh = async (decisionId: string) => {
    await Promise.all([
      utils.decision.listByWorkspace.invalidate({ workspaceId }),
      // The discussion page's side panel lists decisions from the discussion.
      utils.discussion.context.invalidate(),
      utils.decision.getById.invalidate({ workspaceId, decisionId }),
      utils.decision.revisions.invalidate({ workspaceId, decisionId }),
      // Edits reset reviews and finalizing closes them.
      utils.decisionReview.list.invalidate({ workspaceId, decisionId }),
    ]);
  };
  const refreshAccess = async (error: { data?: { code?: string } | null }) => {
    if (["FORBIDDEN", "UNAUTHORIZED", "NOT_FOUND"].includes(error.data?.code ?? "")) {
      await Promise.allSettled([
        utils.workspace.getById.invalidate({ workspaceId }),
        utils.decision.listByWorkspace.invalidate({ workspaceId }),
      ]);
    }
  };
  const create = trpc.decision.create.useMutation({
    onSuccess: (decision) => refresh(decision.id),
    onError: refreshAccess,
  });
  const edit = trpc.decision.edit.useMutation({
    onSuccess: (decision) => refresh(decision.id),
    onError: refreshAccess,
  });
  const finalize = trpc.decision.finalize.useMutation({
    onSuccess: (decision) => refresh(decision.id),
    onError: refreshAccess,
  });
  const supersede = trpc.decision.supersede.useMutation({
    onSuccess: async ({ oldDecisionId, replacementDecisionId }) => {
      await Promise.all([
        refresh(oldDecisionId), refresh(replacementDecisionId),
        utils.decision.replacementHistory.invalidate({ workspaceId }),
        utils.decision.replacementCandidates.invalidate({ workspaceId }),
      ]);
    },
    onError: refreshAccess,
  });
  // The page navigates away after a delete, so only the list views refresh;
  // refetching the deleted record would flash a "not found" state first.
  const remove = trpc.decision.delete.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.decision.listByWorkspace.invalidate({ workspaceId }),
        utils.decision.replacementCandidates.invalidate({ workspaceId }),
      ]);
    },
    onError: refreshAccess,
  });
  return { create, edit, finalize, supersede, remove };
}
