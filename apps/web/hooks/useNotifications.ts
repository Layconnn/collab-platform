"use client";

import { trpc } from "@/lib/trpc/api-client";

export function useNotificationsFeed() {
  return trpc.notification.listForUser.useQuery({
    cursor: undefined,
    take: 20,
    unreadOnly: false,
  });
}

export function useUnreadNotifications() {
  return trpc.notification.listForUser.useQuery({
    cursor: undefined,
    take: 20,
    unreadOnly: true,
  });
}

export function useNotificationActions() {
  const utils = trpc.useUtils();
  const refresh = () => utils.notification.listForUser.invalidate();
  const markAsRead = trpc.notification.markAsRead.useMutation({ onSuccess: refresh });
  const markAllAsRead = trpc.notification.markAllAsRead.useMutation({ onSuccess: refresh });

  return { markAsRead, markAllAsRead };
}
