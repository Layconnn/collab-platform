"use client";

import Link from "next/link";
import { IconButton, Popover, Portal } from "@chakra-ui/react";
import {
  ArrowUpRight,
  Check,
  CheckCheck,
  CircleAlert,
  MessageSquare,
  RotateCw,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { AppIcon } from "@/components/common/AppIcon";
import { UserAvatar } from "@/components/common/UserAvatar";
import {
  useNotificationActions,
  useNotificationsFeed,
  useUnreadNotifications,
} from "@/hooks/useNotifications";
import { resolveUserIdentity } from "@/lib/user-identity";

type NotificationItem = NonNullable<
  ReturnType<typeof useNotificationsFeed>["data"]
>["pages"][number]["items"][number];

const titles: Record<NotificationItem["type"], string> = {
  DISCUSSION_CREATED: "New discussion",
  COMMENT_CREATED: "New reply",
  MENTION: "Mention",
};

function NotificationSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading notifications"
      className="divide-y divide-border-subtle"
    >
      {[0, 1, 2].map((item) => (
        <div key={item} aria-hidden="true" className="flex gap-3 px-4 py-4">
          <div className="size-8 shrink-0 animate-pulse rounded-full bg-surface-active" />
          <div className="min-w-0 flex-1 space-y-2 py-0.5">
            <div className="h-3 w-24 animate-pulse rounded bg-surface-active" />
            <div className="h-3 w-full animate-pulse rounded bg-surface-subtle" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-surface-subtle" />
          </div>
        </div>
      ))}
    </div>
  );
}

function NotificationRow({
  item,
  pending,
  onMarkRead,
  onNavigate,
}: {
  item: NotificationItem;
  pending: boolean;
  onMarkRead: (id: string) => void;
  onNavigate: (item: NotificationItem) => void;
}) {
  const actor = item.actor ? resolveUserIdentity(item.actor) : null;
  const href = item.discussionId
    ? `/workspace/${item.workspaceId}/discussions/${item.discussionId}`
    : null;
  const date = new Date(item.createdAt);
  const formattedDate = Number.isNaN(date.valueOf())
    ? null
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
  const unread = !item.readAt;
  const rowRef = useRef<HTMLLIElement>(null);
  const linkRef = useRef<HTMLAnchorElement>(null);
  const markRequested = useRef(false);

  useEffect(() => {
    if (!unread && markRequested.current) {
      markRequested.current = false;
      (linkRef.current ?? rowRef.current)?.focus();
    } else if (unread && !pending) {
      markRequested.current = false;
    }
  }, [unread, pending]);

  return (
    <li
      ref={rowRef}
      tabIndex={-1}
      className={`border-b border-border-subtle transition-colors motion-reduce:transition-none ${unread ? "bg-surface-subtle/70" : "bg-surface"}`}
    >
      <div className="flex min-w-0 gap-3 px-4 py-3.5 hover:bg-surface-hover/70 focus-within:bg-surface-hover/70">
        <div className="pt-0.5">
          {actor ? (
            <UserAvatar name={actor.avatarName} className="size-8" />
          ) : (
            <span
              aria-hidden="true"
              className="grid size-8 place-items-center rounded-full bg-surface-active text-brand-link"
            >
              <MessageSquare size={16} />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1 wrap-anywhere">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[13px] font-semibold leading-5 text-text-primary">
              {titles[item.type]}
            </p>
            {unread ? (
              <span
                className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-action"
                aria-hidden="true"
              />
            ) : null}
          </div>
          {actor ? (
            <p className="mt-0.5 text-xs font-medium text-text-secondary">
              {actor.label}
            </p>
          ) : null}
          <p className="mt-1 text-[13px] leading-5 text-text-secondary">
            {item.message}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-4 text-text-muted">
            {formattedDate ? (
              <time dateTime={date.toISOString()}>{formattedDate}</time>
            ) : null}
            <span>{unread ? "Unread" : "Read"}</span>
            {!href ? <span>Conversation unavailable</span> : null}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
            {href ? (
              <Link
                ref={linkRef}
                href={href}
                aria-label={`Open discussion for ${titles[item.type].toLowerCase()} notification${actor ? ` from ${actor.label}` : ""}${formattedDate ? `, ${formattedDate}` : ""}`}
                onClick={() => onNavigate(item)}
                className="inline-flex min-h-11 items-center gap-1 rounded text-xs font-semibold text-brand-link hover:text-brand-link-hover focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                Open discussion <ArrowUpRight aria-hidden="true" size={13} />
              </Link>
            ) : null}
            {unread ? (
              <button
                type="button"
                aria-label={`Mark ${titles[item.type].toLowerCase()} notification${actor ? ` from ${actor.label}` : ""}${formattedDate ? `, ${formattedDate}` : ""} as read`}
                disabled={pending}
                onClick={() => { markRequested.current = true; onMarkRead(item.id); }}
                className="inline-flex min-h-11 items-center gap-1 rounded text-xs font-medium text-text-secondary hover:text-text-primary focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-wait disabled:opacity-50"
              >
                <Check aria-hidden="true" size={13} />
                {pending ? "Marking..." : "Mark read"}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </li>
  );
}

export function NotificationDropdown({
  compact = false,
}: {
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const markAllRequested = useRef(false);
  const feed = useNotificationsFeed(open);
  const unread = useUnreadNotifications();
  const { markAsRead, markAllAsRead } = useNotificationActions();
  const unreadCount = unread.data?.items.length ?? 0;
  const feedAccessDenied = [feed.error?.data?.code, unread.error?.data?.code]
    .some((code) => code === "FORBIDDEN" || code === "UNAUTHORIZED");
  const hasMoreUnread = Boolean(unread.data?.nextCursor);
  const unreadLabel = hasMoreUnread ? `${unreadCount}+` : String(unreadCount);
  const badgeLabel = hasMoreUnread
    ? "20+"
    : unreadCount > 9
      ? "9+"
      : String(unreadCount);
  const showUnread = !feedAccessDenied && !unread.isError && unreadCount > 0;
  const accessibleLabel = feedAccessDenied
    ? "Notifications unavailable"
    : unread.isPending
    ? "Notifications, unread count loading"
    : unread.isError
      ? "Notifications, unread count unavailable"
      : `Notifications, ${unreadLabel} unread`;
  const items = feedAccessDenied ? [] : feed.data?.pages.flatMap((page) => page.items) ?? [];

  useEffect(() => {
    if (open && !showUnread && !markAllAsRead.isPending && markAllRequested.current) {
      markAllRequested.current = false;
      closeButtonRef.current?.focus();
    }
  }, [open, showUnread, markAllAsRead.isPending]);

  const markRead = (id: string) => {
    setActionError(null);
    setMarkingId(id);
    markAsRead.mutate(
      { notificationId: id },
      {
        onError: () =>
          setActionError("Could not mark the notification as read. Try again."),
        onSettled: () => setMarkingId(null),
      },
    );
  };

  return (
    <Popover.Root
      open={open}
      onOpenChange={(details) => {
        setOpen(details.open);
        if (details.open) setActionError(null);
      }}
      positioning={{ placement: "bottom-end", strategy: "fixed", gutter: 8 }}
    >
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={accessibleLabel}
          title={accessibleLabel}
          className={`relative inline-flex h-10 items-center justify-center gap-2 rounded-md text-sm font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:ring-2 focus-visible:ring-focus-ring motion-reduce:transition-none ${compact ? "w-10" : "border border-border-subtle bg-surface px-3"}`}
        >
          <AppIcon name="bell" className="size-[18px]" />
          {!compact ? <span>Notifications</span> : null}
          {showUnread ? (
            <span
              aria-hidden="true"
              className="absolute -right-1 -top-1 grid min-h-4 min-w-4 place-items-center rounded-full bg-brand-action px-1 text-[10px] font-semibold leading-4 text-on-brand-action"
            >
              {badgeLabel}
            </span>
          ) : null}
        </button>
      </Popover.Trigger>
      <Portal>
        <Popover.Positioner className="z-40">
          <Popover.Content
            unstyled
            className="flex max-h-[min(34rem,calc(100dvh-4.5rem))] w-[min(26rem,calc(100vw-1rem))] max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-md border border-border bg-surface text-text-primary shadow-lg shadow-black/10 outline-none data-[state=open]:animate-[thread-reveal_160ms_ease-out] motion-reduce:animate-none"
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border-subtle px-4 py-3">
              <div>
                <Popover.Title className="text-sm font-semibold text-text-primary">
                  Notifications
                </Popover.Title>
                <p className="mt-0.5 text-xs text-text-muted">
                  {feedAccessDenied
                    ? "Access changed"
                    : unread.isError
                    ? "Unread count unavailable"
                    : unread.isPending
                      ? "Checking activity..."
                      : showUnread
                        ? `${unreadLabel} unread`
                        : "All caught up"}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {showUnread ? (
                  <button
                    type="button"
                    disabled={markAllAsRead.isPending}
                    onClick={() => {
                      markAllRequested.current = true;
                      setActionError(null);
                      markAllAsRead.mutate(
                        {},
                        {
                          onError: () => {
                            markAllRequested.current = false;
                            setActionError(
                              "Could not mark all notifications as read. Try again.",
                            );
                          },
                        },
                      );
                    }}
                    className="inline-flex min-h-11 items-center gap-1 rounded px-2 text-xs font-medium text-brand-link hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-wait disabled:opacity-50"
                  >
                    <CheckCheck aria-hidden="true" size={14} />
                    {markAllAsRead.isPending ? "Marking..." : "Mark all read"}
                  </button>
                ) : null}
                <Popover.CloseTrigger asChild>
                  <IconButton
                    ref={closeButtonRef}
                    type="button"
                    aria-label="Close notifications"
                    title="Close notifications"
                    size="sm"
                    variant="ghost"
                  >
                    <AppIcon name="close" />
                  </IconButton>
                </Popover.CloseTrigger>
              </div>
            </div>
            {actionError ? (
              <p
                role="alert"
                className="flex items-start gap-2 border-b border-border-subtle px-4 py-2 text-xs text-danger"
              >
                <CircleAlert
                  aria-hidden="true"
                  size={14}
                  className="shrink-0"
                />
                {actionError}
              </p>
            ) : null}
            <div className="min-h-0 overflow-y-auto overscroll-contain">
              {feed.isPending ? <NotificationSkeleton /> : null}
              {feedAccessDenied ? (
                <div role="alert" className="px-4 py-8 text-center">
                  <CircleAlert aria-hidden="true" className="mx-auto mb-2 text-danger" size={20} />
                  <p className="text-sm font-medium">Notifications unavailable</p>
                  <p className="mt-1 text-xs text-text-muted">Your access may have changed. Refresh the page to continue.</p>
                </div>
              ) : feed.isError && !feed.data ? (
                <div role="alert" className="px-4 py-8 text-center">
                  <CircleAlert
                    aria-hidden="true"
                    className="mx-auto mb-2 text-danger"
                    size={20}
                  />
                  <p className="text-sm font-medium">
                    Could not load notifications
                  </p>
                  <button
                    type="button"
                    onClick={() => void feed.refetch()}
                    className="mt-2 inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-brand-link hover:text-brand-link-hover"
                  >
                    <RotateCw aria-hidden="true" size={14} />
                    Try again
                  </button>
                </div>
              ) : null}
              {!feed.isPending && items.length === 0 && !feed.isError ? (
                <div role="status" className="px-6 py-10 text-center">
                  <span
                    aria-hidden="true"
                    className="mx-auto mb-3 grid size-10 place-items-center rounded-full bg-surface-subtle text-brand-link"
                  >
                    <AppIcon name="bell" />
                  </span>
                  <p className="text-sm font-semibold">
                    {showUnread
                      ? "No notifications to show"
                      : "No notifications yet"}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-text-muted">
                    {showUnread
                      ? "Activity may have changed. Check again shortly."
                      : "New conversations and mentions will appear here."}
                  </p>
                </div>
              ) : null}
              {items.length > 0 ? (
                <ul aria-label="Recent notifications">
                  {items.map((item) => (
                    <NotificationRow
                      key={item.id}
                      item={item}
                      pending={markingId === item.id}
                      onMarkRead={markRead}
                      onNavigate={(selected) => {
                        if (!selected.readAt) markRead(selected.id);
                        setOpen(false);
                      }}
                    />
                  ))}
                </ul>
              ) : null}
              {feed.isError && items.length > 0 && !feedAccessDenied ? (
                <p role="alert" className="px-4 py-2 text-xs text-danger">
                  Could not refresh notifications. Showing previously loaded
                  activity.
                </p>
              ) : null}
              {feed.hasNextPage && !feedAccessDenied ? (
                <div className="border-t border-border-subtle p-2">
                  <button
                    type="button"
                    disabled={feed.isFetchingNextPage}
                    onClick={() => void feed.fetchNextPage()}
                    className="min-h-11 w-full rounded text-xs font-semibold text-brand-link hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-50"
                  >
                    {feed.isFetchingNextPage
                      ? "Loading more..."
                      : feed.isFetchNextPageError
                        ? "Try loading more"
                        : "Load more"}
                  </button>
                  {feed.isFetchNextPageError ? (
                    <p role="alert" className="px-2 pb-1 text-xs text-danger">
                      Could not load more notifications.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}
