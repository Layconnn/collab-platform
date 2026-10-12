"use client";

import { trpc } from "@/lib/trpc/api-client";

export function useNotificationsFeed(enabled = true) {
  return trpc.notification.listForUser.useInfiniteQuery(
    { take: 20, unreadOnly: false },
    {
      enabled,
      getNextPageParam: (page) => page.nextCursor ?? undefined,
      staleTime: 0,
      refetchOnWindowFocus: true,
      refetchInterval: enabled ? 60_000 : false,
    },
  );
}

export function useUnreadNotifications() {
  return trpc.notification.listForUser.useQuery(
    { take: 20, unreadOnly: true },
    { staleTime: 0, refetchInterval: 60_000, refetchOnWindowFocus: true },
  );
}

export function useNotificationActions() {
  const utils = trpc.useUtils();
  const refresh = () => utils.notification.listForUser.invalidate();
  const markAsRead = trpc.notification.markAsRead.useMutation({
    onSuccess: refresh,
  });
  const markAllAsRead = trpc.notification.markAllAsRead.useMutation({
    onSuccess: refresh,
  });

  return { markAsRead, markAllAsRead };
}
