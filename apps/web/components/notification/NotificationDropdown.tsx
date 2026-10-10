"use client";

import { useNotificationActions, useNotificationsFeed, useUnreadNotifications } from "@/hooks/useNotifications";
import { LoadingState } from "@/components/common/StateNotice";
import { AppIcon } from "@/components/common/AppIcon";

export function NotificationDropdown({ compact = false }: { compact?: boolean }) {
  const feed = useNotificationsFeed();
  const unread = useUnreadNotifications();
  const { markAsRead, markAllAsRead } = useNotificationActions();

  const unreadCount = unread.data?.items.length ?? 0;
  const accessibleLabel = unread.isLoading
    ? "Notifications, unread count loading"
    : `Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`;

  return (
    <details className="relative">
      <summary
        aria-label={accessibleLabel}
        title={accessibleLabel}
        className={`flex h-10 cursor-pointer list-none items-center justify-center gap-2 rounded-md text-sm font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:ring-2 focus-visible:ring-focus-ring ${compact ? "w-10" : "w-auto border border-border-subtle bg-surface px-3"}`}
      >
        <AppIcon name="bell" />
        {!compact ? <span>Notifications</span> : <span className="sr-only">Notifications</span>}
        {unreadCount > 0 ? (
          <span aria-hidden="true" className="absolute right-0.5 top-0.5 grid min-h-4 min-w-4 place-items-center rounded-full bg-brand-action px-1 text-[9px] font-semibold leading-4 text-on-brand-action">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
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
