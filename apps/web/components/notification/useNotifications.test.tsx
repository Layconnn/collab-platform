import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  feedQuery: vi.fn((...args: unknown[]) => ({ args })),
  unreadQuery: vi.fn((...args: unknown[]) => ({ args })),
  refreshNotifications: vi.fn(async () => {}),
  markReadSuccess: null as null | (() => Promise<unknown>),
  markAllSuccess: null as null | (() => Promise<unknown>),
}));

vi.mock("@/lib/trpc/api-client", () => ({
  trpc: {
    useUtils: () => ({
      notification: { listForUser: { invalidate: mocks.refreshNotifications } },
    }),
    notification: {
      listForUser: {
        useInfiniteQuery: mocks.feedQuery,
        useQuery: mocks.unreadQuery,
      },
      markAsRead: {
        useMutation: (options: { onSuccess: () => Promise<unknown> }) => {
          mocks.markReadSuccess = options.onSuccess;
          return {};
        },
      },
      markAllAsRead: {
        useMutation: (options: { onSuccess: () => Promise<unknown> }) => {
          mocks.markAllSuccess = options.onSuccess;
          return {};
        },
      },
    },
  },
}));

import {
  useNotificationActions,
  useNotificationsFeed,
  useUnreadNotifications,
} from "@/hooks/useNotifications";

describe("notification query lifecycle", () => {
  beforeEach(() => {
    mocks.feedQuery.mockClear();
    mocks.unreadQuery.mockClear();
    mocks.refreshNotifications.mockClear();
  });

  it("fetches the feed on open, then refreshes while it remains open", () => {
    renderHook(() => useNotificationsFeed(true));
    expect(mocks.feedQuery).toHaveBeenCalledWith(
      { take: 20, unreadOnly: false },
      expect.objectContaining({
        enabled: true,
        staleTime: 0,
        refetchOnWindowFocus: true,
        refetchInterval: 60_000,
      }),
    );
    renderHook(() => useNotificationsFeed(false));
    expect(mocks.feedQuery.mock.calls[1][1]).toEqual(
      expect.objectContaining({ enabled: false, refetchInterval: false }),
    );
  });

  it("uses unread-only data for the bell and invalidates both feed variants after reads", async () => {
    renderHook(() => useUnreadNotifications());
    expect(mocks.unreadQuery).toHaveBeenCalledWith(
      { take: 20, unreadOnly: true },
      expect.objectContaining({ staleTime: 0, refetchInterval: 60_000 }),
    );
    renderHook(() => useNotificationActions());
    await act(async () => {
      await mocks.markReadSuccess?.();
    });
    await act(async () => {
      await mocks.markAllSuccess?.();
    });
    expect(mocks.refreshNotifications).toHaveBeenCalledTimes(2);
  });
});
