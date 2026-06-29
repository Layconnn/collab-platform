"use client";

import { Button, Menu, MenuButton, MenuItem, MenuList } from "@chakra-ui/react";

import { useNotificationActions, useNotificationsFeed, useUnreadNotifications } from "@/hooks/useNotifications";
import { LoadingState } from "@/components/common/StateNotice";

export function NotificationDropdown() {
  const feed = useNotificationsFeed();
  const unread = useUnreadNotifications();
  const { markAsRead, markAllAsRead } = useNotificationActions();

  const unreadCount = unread.data?.items.length ?? 0;

  return (
    <Menu>
      <MenuButton as={Button} size="sm" variant="outline">
        Notifications {unreadCount > 0 ? `(${unreadCount})` : ""}
      </MenuButton>
      <MenuList>
        {feed.isLoading ? (
          <MenuItem>
            <LoadingState label="Loading..." />
          </MenuItem>
        ) : null}
        {feed.data?.items.map((item) => (
          <MenuItem
            key={item.id}
            onClick={() => markAsRead.mutate({ notificationId: item.id })}
          >
            <div className="flex flex-col">
              <span className="text-sm">{item.message}</span>
              <span className="text-xs text-slate-500">{item.type}</span>
            </div>
          </MenuItem>
        ))}
        <MenuItem onClick={() => markAllAsRead.mutate({})}>Mark all as read</MenuItem>
      </MenuList>
    </Menu>
  );
}
