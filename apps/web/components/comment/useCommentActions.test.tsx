import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

type Rejection = { data?: { code?: string } };

const mocks = vi.hoisted(() => ({
  refreshComments: vi.fn(async () => {}),
  refreshComment: vi.fn(async () => {}),
  refreshDiscussion: vi.fn(async () => {}),
  refreshWorkspace: vi.fn(async () => {}),
  refreshRoles: vi.fn(async () => {}),
  createOnSuccess: null as null | (() => Promise<unknown>),
  createOnError: null as null | ((error: Rejection) => Promise<void>),
  updateOnError: null as null | ((error: Rejection) => Promise<void>),
}));

vi.mock("@/lib/trpc/api-client", () => ({
  trpc: {
    useUtils: () => ({
      comment: {
        listByDiscussion: { invalidate: mocks.refreshComments },
        getById: { invalidate: mocks.refreshComment },
      },
      discussion: { getById: { invalidate: mocks.refreshDiscussion } },
      workspace: {
        getById: { invalidate: mocks.refreshWorkspace },
        listForUser: { invalidate: mocks.refreshRoles },
      },
    }),
    comment: {
      create: { useMutation: (options: { onSuccess: () => Promise<unknown>; onError: (error: Rejection) => Promise<void> }) => { mocks.createOnSuccess = options.onSuccess; mocks.createOnError = options.onError; return {}; } },
      update: { useMutation: (options: { onError: (error: Rejection) => Promise<void> }) => { mocks.updateOnError = options.onError; return {}; } },
      remove: { useMutation: () => ({}) },
    },
  },
}));

import { useCommentActions } from "@/hooks/useComment";

describe("useCommentActions scoped refresh", () => {
  beforeEach(() => {
    mocks.refreshComments.mockClear();
    mocks.refreshComment.mockClear();
    mocks.refreshDiscussion.mockClear();
    mocks.refreshWorkspace.mockClear();
    mocks.refreshRoles.mockClear();
  });

  it("refreshes only this discussion's comment queries after a write", async () => {
    renderHook(() => useCommentActions("discussion-1", "workspace-1"));
    await act(async () => { await mocks.createOnSuccess?.(); });
    expect(mocks.refreshComments).toHaveBeenCalledWith({ discussionId: "discussion-1" });
    expect(mocks.refreshDiscussion).not.toHaveBeenCalled();
    expect(mocks.refreshRoles).not.toHaveBeenCalled();
  });

  it("refreshes access and role data after a permission rejection", async () => {
    renderHook(() => useCommentActions("discussion-1", "workspace-1"));
    await act(async () => { await mocks.createOnError?.({ data: { code: "FORBIDDEN" } }); });

    expect(mocks.refreshComments).toHaveBeenCalledWith({ discussionId: "discussion-1" });
    expect(mocks.refreshDiscussion).toHaveBeenCalledWith({ discussionId: "discussion-1" });
    expect(mocks.refreshWorkspace).toHaveBeenCalledWith({ workspaceId: "workspace-1" });
    expect(mocks.refreshRoles).toHaveBeenCalledTimes(1);
  });

  it("refreshes stale comment and discussion data after a missing target", async () => {
    renderHook(() => useCommentActions("discussion-1", "workspace-1"));
    await act(async () => { await mocks.updateOnError?.({ data: { code: "NOT_FOUND" } }); });

    expect(mocks.refreshComments).toHaveBeenCalledWith({ discussionId: "discussion-1" });
    expect(mocks.refreshDiscussion).toHaveBeenCalledWith({ discussionId: "discussion-1" });
    expect(mocks.refreshRoles).not.toHaveBeenCalled();
  });
});
