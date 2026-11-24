"use client";

import { trpc } from "@/lib/trpc/api-client";

export function useNeedsYou(all: boolean) {
  return trpc.home.needsYou.useQuery({ all });
}

export function useRecentDecisions() {
  return trpc.home.recentDecisions.useQuery();
}

// Marking items done also clears them from the notification bell.
export function useDismissNeeds() {
  const utils = trpc.useUtils();
  const refresh = () => Promise.all([
    utils.home.needsYou.invalidate(),
    utils.notification.listForUser.invalidate(),
  ]);
  const dismiss = trpc.home.dismiss.useMutation({ onSettled: refresh });
  const dismissAll = trpc.home.dismissAll.useMutation({ onSettled: refresh });
  return { dismiss, dismissAll };
}

export function useWorkspacePulse() {
  return trpc.home.pulse.useQuery();
}
