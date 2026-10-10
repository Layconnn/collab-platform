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
      <summary className="cursor-pointer list-none whitespace-nowrap rounded-md border border-[#cbd8d0] bg-white px-3 py-2 text-sm font-medium text-[#34443c] hover:bg-[#edf4ef]">
        Notifications {unreadCount > 0 ? `(${unreadCount})` : ""}
      </summary>
      <div className="absolute right-0 z-20 mt-2 max-h-96 w-[min(20rem,calc(100vw-2rem))] overflow-y-auto rounded-md border border-[#dce6e0] bg-white p-2 shadow-lg">
        {feed.isLoading ? (
          <div className="p-3">
            <LoadingState label="Loading..." />
          </div>
        ) : null}
        {feed.error ? <p role="alert" className="p-3 text-sm text-red-700">Could not load notifications.</p> : null}
        {!feed.isLoading && !feed.error && feed.data?.items.length === 0 ? (
          <p className="p-3 text-sm text-[#63716a]">You are all caught up.</p>
        ) : null}
        {feed.data?.items.map((item) => (
          <div key={item.id} className="border-b border-[#edf1ee] p-3">
            <div className="flex flex-col gap-1">
              <span className="text-sm">{item.message}</span>
              <span className="text-xs text-[#63716a]">{item.type}</span>
            </div>
            {!item.readAt ? (
              <button className="mt-2 text-xs font-semibold text-[#16765b]" onClick={() => markAsRead.mutate({ notificationId: item.id })}>
                Mark as read
              </button>
            ) : null}
          </div>
        ))}
        <button className="w-full p-3 text-left text-sm font-semibold text-[#16765b] disabled:opacity-50" onClick={() => markAllAsRead.mutate({})} disabled={unreadCount === 0 || markAllAsRead.isPending}>
          Mark all as read
        </button>
      </div>
    </details>
  );
}
