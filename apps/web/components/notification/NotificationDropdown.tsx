"use client";

import { useNotificationActions, useNotificationsFeed, useUnreadNotifications } from "@/hooks/useNotifications";
import { LoadingState } from "@/components/common/StateNotice";

export function NotificationDropdown() {
  const feed = useNotificationsFeed();
  const unread = useUnreadNotifications();
  const { markAsRead, markAllAsRead } = useNotificationActions();

  const unreadCount = unread.data?.items.length ?? 0;

  return (
    <details className="relative">
      <summary className="cursor-pointer list-none rounded border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700">
        Notifications {unreadCount > 0 ? `(${unreadCount})` : ""}
      </summary>
      <div className="absolute right-0 z-20 mt-2 max-h-96 w-80 overflow-y-auto rounded border border-slate-200 bg-white p-2 shadow-lg">
        {feed.isLoading ? (
          <div className="p-3">
            <LoadingState label="Loading..." />
          </div>
        ) : null}
        {feed.error ? <p role="alert" className="p-3 text-sm text-red-700">Could not load notifications.</p> : null}
        {!feed.isLoading && !feed.error && feed.data?.items.length === 0 ? (
          <p className="p-3 text-sm text-slate-500">You are all caught up.</p>
        ) : null}
        {feed.data?.items.map((item) => (
          <div key={item.id} className="border-b border-slate-100 p-3">
            <div className="flex flex-col gap-1">
              <span className="text-sm">{item.message}</span>
              <span className="text-xs text-slate-500">{item.type}</span>
            </div>
            {!item.readAt ? (
              <button className="mt-2 text-xs font-medium text-teal-800" onClick={() => markAsRead.mutate({ notificationId: item.id })}>
                Mark as read
              </button>
            ) : null}
          </div>
        ))}
        <button className="w-full p-3 text-left text-sm font-medium text-teal-800 disabled:opacity-50" onClick={() => markAllAsRead.mutate({})} disabled={unreadCount === 0 || markAllAsRead.isPending}>
          Mark all as read
        </button>
      </div>
    </details>
  );
}
