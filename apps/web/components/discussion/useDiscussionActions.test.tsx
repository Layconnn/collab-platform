import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

type Rejection = { data?: { code?: string } };

const mocks = vi.hoisted(() => ({
  refreshList: vi.fn(async () => {}),
  refreshWorkspace: vi.fn(async () => {}),
  refreshRoles: vi.fn(async () => {}),
  refreshDetail: vi.fn(async () => {}),
  updateOnError: null as null | ((error: Rejection) => Promise<void>),
  removeOnError: null as null | ((error: Rejection) => Promise<void>),
}));

vi.mock("@/lib/trpc/api-client", () => ({
  trpc: {
    useUtils: () => ({
      discussion: {
        listByWorkspace: { invalidate: mocks.refreshList },
        getById: { invalidate: mocks.refreshDetail },
      },
      workspace: {
        getById: { invalidate: mocks.refreshWorkspace },
        listForUser: { invalidate: mocks.refreshRoles },
      },
    }),
    discussion: {
      create: { useMutation: () => ({}) },
      update: { useMutation: (options: { onError: (error: Rejection) => Promise<void> }) => {
        mocks.updateOnError = options.onError;
        return {};
      } },
      remove: { useMutation: (options: { onError: (error: Rejection) => Promise<void> }) => {
        mocks.removeOnError = options.onError;
        return {};
      } },
    },
  },
}));

import { useDiscussionActions } from "@/hooks/useDiscussion";

describe("useDiscussionActions permission refresh", () => {
  beforeEach(() => {
    mocks.refreshList.mockClear();
    mocks.refreshWorkspace.mockClear();
    mocks.refreshRoles.mockClear();
    mocks.refreshDetail.mockClear();
    mocks.updateOnError = null;
    mocks.removeOnError = null;
  });

  it("refreshes discussion access and workspace roles after a rejected update", async () => {
    renderHook(() => useDiscussionActions("workspace-1"));

    await act(async () => { await mocks.updateOnError?.({ data: { code: "FORBIDDEN" } }); });

    expect(mocks.refreshList).toHaveBeenCalledWith({ workspaceId: "workspace-1", take: 20 });
    expect(mocks.refreshWorkspace).toHaveBeenCalledWith({ workspaceId: "workspace-1" });
    expect(mocks.refreshRoles).toHaveBeenCalledTimes(1);
  });

  it("refreshes stale rows when a deletion target is gone", async () => {
    renderHook(() => useDiscussionActions("workspace-1"));

    await act(async () => { await mocks.removeOnError?.({ data: { code: "NOT_FOUND" } }); });

    expect(mocks.refreshList).toHaveBeenCalledWith({ workspaceId: "workspace-1", take: 20 });
    expect(mocks.refreshRoles).not.toHaveBeenCalled();
  });
});
