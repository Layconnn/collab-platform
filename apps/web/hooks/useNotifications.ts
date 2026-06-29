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
  const markAsRead = trpc.notification.markAsRead.useMutation();
  const markAllAsRead = trpc.notification.markAllAsRead.useMutation();

  return { markAsRead, markAllAsRead };
}
