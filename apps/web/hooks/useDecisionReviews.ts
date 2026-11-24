"use client";

import { trpc } from "@/lib/trpc/api-client";

export function useDecisionReviews(workspaceId: string, decisionId: string, enabled = true) {
  return trpc.decisionReview.list.useQuery({ workspaceId, decisionId }, { enabled: enabled && Boolean(workspaceId && decisionId) });
}

// Every review mutation returns the fresh review state, which replaces the
// cached list; Home's "Needs you" changes too once reviews reach it.
export function useReviewActions(workspaceId: string, decisionId: string) {
  const utils = trpc.useUtils();
  const onSuccess = (data: Awaited<ReturnType<typeof utils.decisionReview.list.fetch>>) => {
    utils.decisionReview.list.setData({ workspaceId, decisionId }, data);
    void utils.home.needsYou.invalidate();
  };
  const onError = () => void utils.decisionReview.list.invalidate({ workspaceId, decisionId });
  return {
    request: trpc.decisionReview.request.useMutation({ onSuccess, onError }),
    setRule: trpc.decisionReview.setRule.useMutation({ onSuccess, onError }),
    withdraw: trpc.decisionReview.withdraw.useMutation({ onSuccess, onError }),
    respond: trpc.decisionReview.respond.useMutation({ onSuccess, onError }),
  };
}
