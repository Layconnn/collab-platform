import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChakraProvider } from "@chakra-ui/react";

import { uiSystem } from "@/lib/ui-system";

const mocks = vi.hoisted(() => ({
  feed: {} as Record<string, unknown>,
  unread: {} as Record<string, unknown>,
  markRead: vi.fn(),
  markAll: vi.fn(),
  fetchNextPage: vi.fn(),
  refetch: vi.fn(),
}));

vi.mock("@/hooks/useNotifications", () => ({
  useNotificationsFeed: () => mocks.feed,
  useUnreadNotifications: () => mocks.unread,
  useNotificationActions: () => ({
    markAsRead: { mutate: mocks.markRead, isPending: false },
    markAllAsRead: { mutate: mocks.markAll, isPending: false },
  }),
}));

import { NotificationDropdown } from "@/components/notification/NotificationDropdown";

const workspaceId = "c000000000000000000000001";
const discussionId = "c000000000000000000000002";
const notification = {
  id: "c000000000000000000000003",
  type: "MENTION",
  message: "You were mentioned in a discussion.",
  workspaceId,
  discussionId: discussionId as string | null,
  commentId: null,
  readAt: null as Date | null,
  createdAt: new Date("2026-10-01T10:00:00.000Z"),
  actor: { id: "user-1", name: "Maya Chen" as string | null, username: "maya" },
};

function setFeed(
  items: (typeof notification)[],
  overrides: Record<string, unknown> = {},
) {
  mocks.feed = {
    data: { pages: [{ items, nextCursor: null }] },
    isPending: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    fetchNextPage: mocks.fetchNextPage,
    refetch: mocks.refetch,
    ...overrides,
  };
}

function renderDropdown() {
  return render(
    <ChakraProvider value={uiSystem}>
      <NotificationDropdown compact />
    </ChakraProvider>,
  );
}

describe("NotificationDropdown", () => {
  beforeEach(() => {
    vi.stubGlobal("CSS", { escape: (value: string) => value });
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    setFeed([notification]);
    mocks.unread = {
      data: { items: [notification], nextCursor: null },
      isPending: false,
      isError: false,
    };
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    mocks.markRead.mockReset();
    mocks.markAll.mockReset();
    mocks.fetchNextPage.mockReset();
    mocks.refetch.mockReset();
  });

  it("shows an exact count when complete and a lower bound when unread pages remain", () => {
    const { rerender } = renderDropdown();
    expect(
      screen.getByRole("button", { name: "Notifications, 1 unread" }),
    ).toBeTruthy();
    mocks.unread = {
      data: {
        items: Array.from({ length: 20 }, () => notification),
        nextCursor: notification.id,
      },
      isPending: false,
      isError: false,
    };
    rerender(
      <ChakraProvider value={uiSystem}>
        <NotificationDropdown compact />
      </ChakraProvider>,
    );
    expect(
      screen.getByRole("button", { name: "Notifications, 20+ unread" }),
    ).toBeTruthy();
    expect(screen.getByText("20+")).toBeTruthy();
  });

  it("shows an honest empty state and closes with Escape", async () => {
    setFeed([]);
    mocks.unread = {
      data: { items: [], nextCursor: null },
      isPending: false,
      isError: false,
    };
    renderDropdown();
    const user = userEvent.setup();
    const trigger = screen.getByRole("button", {
      name: "Notifications, 0 unread",
    });
    trigger.focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByText("No notifications yet")).toBeTruthy();
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(trigger.getAttribute("aria-expanded")).not.toBe("true"),
    );
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("shows mixed read states and the refreshed result after a successful read", async () => {
    const readItem = {
      ...notification,
      id: "c000000000000000000000004",
      readAt: new Date("2026-10-02T10:00:00.000Z"),
    };
    setFeed([notification, readItem]);
    const { rerender } = renderDropdown();
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: "Notifications, 1 unread" }),
    );
    expect((await screen.findAllByRole("listitem")).length).toBe(2);
    expect(screen.getByText("Unread")).toBeTruthy();
    expect(screen.getByText("Read")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /Mark mention notification from Maya Chen.*as read/ }));
    mocks.markRead.mock.calls[0][1].onSettled();
    setFeed([
      { ...notification, readAt: new Date("2026-10-02T11:00:00.000Z") },
      readItem,
    ]);
    mocks.unread = {
      data: { items: [], nextCursor: null },
      isPending: false,
      isError: false,
    };
    rerender(
      <ChakraProvider value={uiSystem}>
        <NotificationDropdown compact />
      </ChakraProvider>,
    );
    expect(
      screen.getByRole("button", { name: "Notifications, 0 unread" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Mark mention notification.*as read/ })).toBeNull();
    expect(document.activeElement).toBe(screen.getAllByRole("link", { name: /Open discussion for mention notification/ })[0]);
  });

  it("uses contextual rows while the feed is loading", async () => {
    setFeed([], { data: undefined, isPending: true });
    renderDropdown();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /Notifications, / }));
    expect(
      await screen.findByRole("status", { name: "Loading notifications" }),
    ).toBeTruthy();
  });

  it("shows read state, actual actor and date without a mark action", async () => {
    setFeed([
      { ...notification, readAt: new Date("2026-10-02T10:00:00.000Z") },
    ]);
    renderDropdown();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /Notifications, / }));
    expect(await screen.findByText("Maya Chen")).toBeTruthy();
    expect(screen.getByText("Read")).toBeTruthy();
    expect(screen.getByRole("time")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Mark mention notification.*as read/ })).toBeNull();
  });

  it("uses the actor username when a display name is unavailable", async () => {
    setFeed([{ ...notification, actor: { ...notification.actor, name: null } }]);
    renderDropdown();
    await userEvent.setup().click(screen.getByRole("button", { name: /Notifications, / }));
    expect(await screen.findByText("maya")).toBeTruthy();
    expect(screen.queryByText("Workspace member")).toBeNull();
  });

  it("marks one unread item and exposes mutation failure without changing its state", async () => {
    renderDropdown();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Notifications, / }));
    await user.click(await screen.findByRole("button", { name: /Mark mention notification.*as read/ }));
    expect(mocks.markRead).toHaveBeenCalledWith(
      { notificationId: notification.id },
      expect.any(Object),
    );
    mocks.markRead.mock.calls[0][1].onError();
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Could not mark the notification as read. Try again.",
    );
    expect(screen.getByText("Unread")).toBeTruthy();
  });

  it("navigates only when a real discussion ID exists and attempts to mark unread on navigation", async () => {
    renderDropdown();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Notifications, / }));
    const link = await screen.findByRole("link", { name: /Open discussion for mention notification/ });
    expect(link.getAttribute("href")).toBe(
      `/workspace/${workspaceId}/discussions/${discussionId}`,
    );
    link.addEventListener("click", (event) => event.preventDefault());
    await user.click(link);
    expect(mocks.markRead).toHaveBeenCalledWith(
      { notificationId: notification.id },
      expect.any(Object),
    );
  });

  it("does not link a deleted discussion and handles long text", async () => {
    const longMessage = "A long notification. ".repeat(25);
    setFeed([{ ...notification, discussionId: null, message: longMessage }]);
    renderDropdown();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /Notifications, / }));
    expect(await screen.findByText(longMessage.trim())).toBeTruthy();
    expect(screen.getByText("Conversation unavailable")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Open discussion for mention notification/ })).toBeNull();
  });

  it("shows pagination failure with a retry action", async () => {
    setFeed([notification], { hasNextPage: true, isFetchNextPageError: true });
    renderDropdown();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Notifications, / }));
    await user.click(
      await screen.findByRole("button", { name: "Try loading more" }),
    );
    expect(mocks.fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("offers retry when initial loading fails and never implies an exact unread count on error", async () => {
    setFeed([], { data: undefined, isError: true });
    mocks.unread = { data: undefined, isPending: false, isError: true };
    renderDropdown();
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", {
        name: "Notifications, unread count unavailable",
      }),
    );
    await user.click(await screen.findByRole("button", { name: "Try again" }));
    expect(mocks.refetch).toHaveBeenCalledTimes(1);
  });

  it("hides cached notification rows and unread actions after access is denied", async () => {
    setFeed([notification], { isError: true, error: { data: { code: "FORBIDDEN" } }, hasNextPage: true });
    renderDropdown();
    await userEvent.setup().click(screen.getByRole("button", { name: "Notifications unavailable" }));
    expect(await screen.findByText("Notifications unavailable")).toBeTruthy();
    expect(screen.queryByText(notification.message)).toBeNull();
    expect(screen.queryByRole("button", { name: /Mark mention notification.*as read/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Mark all read" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("hides cached feed rows when only the unread query reports expired access", async () => {
    mocks.unread = { data: { items: [notification], nextCursor: null }, isPending: false, isError: true, error: { data: { code: "UNAUTHORIZED" } } };
    renderDropdown();
    await userEvent.setup().click(screen.getByRole("button", { name: "Notifications unavailable" }));
    expect(await screen.findByText("Notifications unavailable")).toBeTruthy();
    expect(screen.queryByText(notification.message)).toBeNull();
  });

  it("reports failed bulk marking", async () => {
    renderDropdown();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Notifications, / }));
    await user.click(
      await screen.findByRole("button", { name: "Mark all read" }),
    );
    expect(mocks.markAll).toHaveBeenCalledWith({}, expect.any(Object));
    mocks.markAll.mock.calls[0][1].onError();
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Could not mark all notifications as read. Try again.",
    );
  });

  it("moves focus to the close control after all unread notifications are marked", async () => {
    const { rerender } = renderDropdown();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Notifications, / }));
    await user.click(await screen.findByRole("button", { name: "Mark all read" }));
    mocks.unread = { data: { items: [], nextCursor: null }, isPending: false, isError: false };
    setFeed([{ ...notification, readAt: new Date("2026-10-02T11:00:00.000Z") }]);
    rerender(<ChakraProvider value={uiSystem}><NotificationDropdown compact /></ChakraProvider>);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close notifications" })));
  });
});
