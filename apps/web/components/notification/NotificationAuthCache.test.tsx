import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  resetNotifications: vi.fn(async () => {}),
  refreshMe: vi.fn(async () => {}),
  callbacks: {} as {
    login: (result: { csrfToken: string }) => Promise<void>;
    register: (result: { csrfToken: string }) => Promise<void>;
    logout: () => Promise<void>;
  },
}));

vi.mock("@/lib/trpc/api-client", () => ({
  trpc: {
    useUtils: () => ({
      notification: { listForUser: { reset: mocks.resetNotifications } },
      auth: { me: { invalidate: mocks.refreshMe } },
    }),
    auth: {
      me: { useQuery: () => ({ data: null, isLoading: false }) },
      login: {
        useMutation: (options: {
          onSuccess: (result: { csrfToken: string }) => Promise<void>;
        }) => {
          mocks.callbacks.login = options.onSuccess;
          return {};
        },
      },
      register: {
        useMutation: (options: {
          onSuccess: (result: { csrfToken: string }) => Promise<void>;
        }) => {
          mocks.callbacks.register = options.onSuccess;
          return {};
        },
      },
      logout: {
        useMutation: (options: { onSuccess: () => Promise<void> }) => {
          mocks.callbacks.logout = options.onSuccess;
          return {};
        },
      },
      changePassword: { useMutation: () => ({}) },
    },
  },
}));

import { useAuth } from "@/hooks/useAuth";

describe("notification cache across accounts", () => {
  beforeEach(() => {
    mocks.resetNotifications.mockClear();
    mocks.refreshMe.mockClear();
    sessionStorage.clear();
  });

  it.each(["login", "register"] as const)(
    "clears previous-account notifications on %s",
    async (action) => {
      renderHook(() => useAuth());
      await act(async () => {
        await mocks.callbacks[action]({ csrfToken: "new-session" });
      });

      expect(sessionStorage.getItem("csrf_token")).toBe("new-session");
      expect(mocks.resetNotifications).toHaveBeenCalledTimes(1);
      expect(mocks.refreshMe).toHaveBeenCalledTimes(1);
      expect(mocks.resetNotifications.mock.invocationCallOrder[0]).toBeLessThan(
        mocks.refreshMe.mock.invocationCallOrder[0],
      );
    },
  );

  it("clears notification data before the signed-out session can render", async () => {
    sessionStorage.setItem("csrf_token", "old-session");
    renderHook(() => useAuth());
    await act(async () => {
      await mocks.callbacks.logout();
    });

    expect(sessionStorage.getItem("csrf_token")).toBeNull();
    expect(mocks.resetNotifications).toHaveBeenCalledTimes(1);
    expect(mocks.refreshMe).toHaveBeenCalledTimes(1);
    expect(mocks.resetNotifications.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.refreshMe.mock.invocationCallOrder[0],
    );
  });
});
