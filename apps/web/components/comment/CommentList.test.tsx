import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChakraProvider } from "@chakra-ui/react";
import { uiSystem } from "@/lib/ui-system";

const mocks = vi.hoisted(() => ({
  replies: {} as Record<string, unknown[]>,
  loadedParents: new Set<string>(),
  replyHasNextPage: {} as Record<string, boolean>,
  replyErrors: {} as Record<string, { data: { code: string } }>,
  fetchNextPage: vi.fn(),
  remove: vi.fn(),
  update: vi.fn(),
  updateError: null as Error | null,
  removeError: null as Error | null,
}));

vi.mock("@/hooks/useComment", () => ({
  useCommentList: (_discussionId: string, parentId?: string, enabled = true) => {
    if (parentId && enabled) mocks.loadedParents.add(parentId);
    return {
      data: !parentId || mocks.loadedParents.has(parentId) ? { pages: [{ items: parentId ? mocks.replies[parentId] ?? [] : [] }] } : undefined,
      isLoading: false,
      error: parentId ? mocks.replyErrors[parentId] ?? null : null,
      hasNextPage: parentId ? mocks.replyHasNextPage[parentId] ?? false : false,
      isFetchingNextPage: false,
      isFetchNextPageError: false,
      fetchNextPage: mocks.fetchNextPage,
      refetch: vi.fn(),
    };
  },
  useCommentActions: () => ({
    update: { mutateAsync: mocks.update, isPending: false, get error() { return mocks.updateError; }, reset: () => { mocks.updateError = null; } },
    remove: { mutate: mocks.remove, isPending: false, get error() { return mocks.removeError; } },
  }),
}));
vi.mock("@/components/comment/CreateCommentForm", () => ({
  CreateCommentForm: ({ onCancel, active }: { onCancel: () => void; active: boolean }) => <div data-active={active}><label>Reply draft <input /></label><button type="button" onClick={onCancel}>Cancel draft</button></div>,
}));
vi.mock("@/hooks/useMentionMembers", () => ({
  useMentionMembers: () => ({ data: [], isFetching: false, isError: false, refetch: vi.fn() }),
}));

import { CommentList } from "@/components/comment/CommentList";
import type { useCommentList } from "@/hooks/useComment";

const discussionId = "c000000000000000000000001";
const workspaceId = "c000000000000000000000002";
const root = {
  id: "c000000000000000000000003",
  discussionId,
  parentCommentId: null,
  depth: 0,
  body: "Keep the setup context here. @maya can review this.",
  author: { id: "user-1", name: "Maya Chen", username: "maya" },
  createdAt: new Date("2026-10-01T10:00:00.000Z"),
  updatedAt: new Date("2026-10-01T10:00:00.000Z"),
};
const reply = {
  ...root,
  id: "c000000000000000000000004",
  parentCommentId: root.id,
  depth: 1,
  body: "The first command should include the database step.",
  author: { id: "user-2", name: null, username: "lina" },
};

function query(items: unknown[] = [root], overrides: Record<string, unknown> = {}) {
  return {
    data: { pages: [{ items }] },
    isLoading: false,
    error: null,
    hasNextPage: false,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useCommentList>;
}

function view(items: unknown[] = [root], viewer = { id: "user-2", canAct: true, canManageOthers: false }) {
  return <ChakraProvider value={uiSystem}><CommentList discussionId={discussionId} workspaceId={workspaceId} viewer={viewer} query={query(items)} /></ChakraProvider>;
}

describe("CommentList", () => {
  beforeEach(() => {
    vi.stubGlobal("CSS", { escape: (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "\\$&") });
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
    mocks.replies = {};
    mocks.loadedParents = new Set();
    mocks.replyHasNextPage = {};
    mocks.replyErrors = {};
    mocks.fetchNextPage.mockReset();
    mocks.updateError = null;
    mocks.removeError = null;
    mocks.update.mockReset();
    mocks.remove.mockReset();
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("renders full plain-text content and a real username in a nested reply", async () => {
    const user = userEvent.setup();
    mocks.replies[root.id] = [reply];
    render(view());

    expect(screen.getByText(/Keep the setup context here/)).toBeTruthy();
    expect(screen.getByText("@maya")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Check for replies" }));
    expect(screen.getByText(reply.body)).toBeTruthy();
    expect(screen.getByText("lina")).toBeTruthy();
    expect(screen.getByText("LI")).toBeTruthy();
    expect(screen.queryByText("?")).toBeNull();
  });

  it("names the reply target using the same username policy", async () => {
    const user = userEvent.setup();
    render(view([{ ...root, author: { ...root.author, name: null } }]));
    await user.click(screen.getByRole("button", { name: "Reply" }));
    expect(screen.getByText("Replying to maya")).toBeTruthy();
  });

  it("uses a safe reply target when the author is unavailable", async () => {
    const user = userEvent.setup();
    render(view([{ ...root, author: null }]));
    await user.click(screen.getByRole("button", { name: "Reply" }));
    expect(screen.getByText("Replying to Unavailable account")).toBeTruthy();
  });

  it("offers restrained discovery when child replies have not been queried", () => {
    render(view());
    expect(screen.getByRole("button", { name: "Check for replies" }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("No replies in this branch yet.")).toBeNull();
  });

  it("removes reply controls after confirming an empty branch and remembers that query result", async () => {
    const user = userEvent.setup();
    const rendered = render(view());
    await user.click(screen.getByRole("button", { name: "Check for replies" }));
    expect(screen.queryByRole("button", { name: /replies|thread/i })).toBeNull();
    expect(screen.queryByText("No replies in this branch yet.")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("No replies yet.");
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Reply" })));
    rendered.rerender(view());
    expect(screen.queryByRole("button", { name: /replies|thread/i })).toBeNull();

    mocks.replies[root.id] = [reply];
    rendered.rerender(view());
    expect(screen.getByRole("button", { name: "Hide replies" })).toBeTruthy();
    expect(screen.getByText(reply.body)).toBeTruthy();
  });

  it("restores focus to the comment after an empty lookup for a read-only viewer", async () => {
    const user = userEvent.setup();
    render(view([root], { id: "user-2", canAct: false, canManageOthers: false }));
    await user.click(screen.getByRole("button", { name: "Check for replies" }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("article", { name: "Comment by Maya Chen" })));
  });

  it("keeps pagination available until an initially empty page yields replies", async () => {
    const user = userEvent.setup();
    mocks.replyHasNextPage[root.id] = true;
    const rendered = render(view());
    await user.click(screen.getByRole("button", { name: "Check for replies" }));
    expect(screen.getByRole("button", { name: "Close thread" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Load more replies" }));
    expect(mocks.fetchNextPage).toHaveBeenCalledOnce();

    mocks.replies[root.id] = [reply];
    mocks.replyHasNextPage[root.id] = false;
    rendered.rerender(view());
    expect(screen.getByText(reply.body)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Hide replies" }));
    expect(screen.getByRole("button", { name: "Show replies" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Show replies" }));
    expect(screen.getByText(reply.body)).toBeTruthy();
  });

  it("keeps a reply draft when its composer is closed and reopened", async () => {
    const user = userEvent.setup();
    render(view());
    await user.click(screen.getByRole("button", { name: "Reply" }));
    await user.type(screen.getByRole("textbox", { name: "Reply draft" }), "A draft worth keeping");
    await user.click(screen.getByRole("button", { name: "Cancel draft" }));
    expect(screen.getByRole("textbox", { name: "Reply draft", hidden: true }).closest("[hidden]")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Reply" }));
    expect(screen.getByRole("textbox", { name: "Reply draft" })).toHaveProperty("value", "A draft worth keeping");
  });

  it("collapses and expands an already loaded branch without discarding it", async () => {
    const user = userEvent.setup();
    mocks.replies[root.id] = [reply];
    render(view());
    await user.click(screen.getByRole("button", { name: "Check for replies" }));
    const content = screen.getByText(reply.body);
    await user.click(screen.getByRole("button", { name: "Hide replies" }));
    expect(content.closest("[hidden]")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Show replies" }));
    expect(screen.getByText(reply.body)).toBe(content);
  });

  it("propagates nested access denial and hides a reply form after access is lost", async () => {
    const user = userEvent.setup();
    const onAccessDenied = vi.fn();
    const viewer = { id: "user-2", canAct: true, canManageOthers: false };
    const rendered = render(<ChakraProvider value={uiSystem}><CommentList discussionId={discussionId} workspaceId={workspaceId} viewer={viewer} query={query()} onAccessDenied={onAccessDenied} /></ChakraProvider>);
    await user.click(screen.getByRole("button", { name: "Reply" }));
    expect(screen.getByRole("textbox", { name: "Reply draft" })).toBeTruthy();
    mocks.replyErrors[root.id] = { data: { code: "FORBIDDEN" } };
    rendered.rerender(<ChakraProvider value={uiSystem}><CommentList discussionId={discussionId} workspaceId={workspaceId} viewer={{ ...viewer, canAct: false }} query={query()} onAccessDenied={onAccessDenied} /></ChakraProvider>);
    expect(screen.queryByRole("textbox", { name: "Reply draft" })).toBeNull();
    await waitFor(() => expect(onAccessDenied).toHaveBeenCalled());
  });

  it("hides actions from a non-author member and allows author or manager actions", async () => {
    const user = userEvent.setup();
    const rendered = render(view());
    expect(screen.queryByRole("button", { name: "Actions for comment by Maya Chen" })).toBeNull();
    rendered.rerender(view([root], { id: "user-1", canAct: true, canManageOthers: false }));
    await user.click(screen.getByRole("button", { name: "Actions for comment by Maya Chen" }));
    expect(await screen.findByRole("menuitem", { name: "Edit comment" })).toBeTruthy();
    rendered.rerender(view([root], { id: "user-3", canAct: true, canManageOthers: true }));
    expect(screen.getByRole("button", { name: "Actions for comment by Maya Chen" })).toBeTruthy();
  });

  it("confirms deletion and keeps the original comment on edit cancel", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(view([root], { id: "user-1", canAct: true, canManageOthers: false }));
    const trigger = screen.getByRole("button", { name: "Actions for comment by Maya Chen" });
    await user.click(trigger);
    await user.click(await screen.findByRole("menuitem", { name: "Edit comment" }));
    const field = screen.getByRole("combobox", { name: "Edit comment" });
    await user.clear(field);
    await user.type(field, "Changed draft");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText(/Keep the setup context here/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Actions for comment by Maya Chen" }));
    await user.click(await screen.findByRole("menuitem", { name: "Delete comment" }));
    expect(mocks.remove).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Actions for comment by Maya Chen" }));
    await user.click(await screen.findByRole("menuitem", { name: "Delete comment" }));
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith({ commentId: root.id }));
    confirm.mockRestore();
  });

  it("supports keyboard activation for reply, edit, and delete confirmation", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(view([root], { id: "user-1", canAct: true, canManageOthers: false }));

    const replyButton = screen.getByRole("button", { name: "Reply" });
    replyButton.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("textbox", { name: "Reply draft" })).toBeTruthy();
    screen.getByRole("button", { name: "Cancel draft" }).focus();
    await user.keyboard("{Enter}");
    expect(screen.queryByRole("textbox", { name: "Reply draft" })).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(replyButton));

    const trigger = screen.getByRole("button", { name: "Actions for comment by Maya Chen" });
    trigger.focus();
    await user.keyboard("{Enter}");
    const editItem = await screen.findByRole("menuitem", { name: "Edit comment" });
    editItem.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("combobox", { name: "Edit comment" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.getByText(/Keep the setup context here/)).toBeTruthy());
    const restoredTrigger = screen.getByRole("button", { name: "Actions for comment by Maya Chen" });
    await waitFor(() => expect(document.activeElement).toBe(restoredTrigger));

    await user.keyboard("{Enter}");
    expect(await screen.findByRole("menuitem", { name: "Delete comment" })).toBeTruthy();
    await user.keyboard("{ArrowDown}{Enter}");
    await waitFor(() => expect(confirm).toHaveBeenCalledOnce());
    expect(mocks.remove).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it("validates an edit and preserves the draft after an update failure", async () => {
    const user = userEvent.setup();
    const failure = new Error("Internal server details");
    mocks.update.mockImplementation(async () => { mocks.updateError = failure; throw failure; });
    render(view([root], { id: "user-1", canAct: true, canManageOthers: false }));
    await user.click(screen.getByRole("button", { name: "Actions for comment by Maya Chen" }));
    await user.click(await screen.findByRole("menuitem", { name: "Edit comment" }));
    const field = screen.getByRole("combobox", { name: "Edit comment" });
    await user.clear(field);
    await user.click(screen.getByRole("button", { name: "Save comment" }));
    expect(await screen.findByText(/Write a comment of up to/)).toBeTruthy();
    expect(mocks.update).not.toHaveBeenCalled();
    await user.type(field, "Keep the setup path in one place.");
    await user.click(screen.getByRole("button", { name: "Save comment" }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ commentId: root.id, body: "Keep the setup path in one place." }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Your changes could not be saved. Please try again.");
    expect(screen.queryByText("Internal server details")).toBeNull();
    expect(field).toHaveProperty("value", "Keep the setup path in one place.");
  });

  it("retains deep comment content without offering an unsupported ninth-level reply", () => {
    const longBody = `A long technical note\n${"x".repeat(300)}`;
    const deep = { ...root, depth: 8, body: longBody };
    const { container } = render(view([deep]));
    expect(container.textContent).toContain(longBody);
    expect(screen.queryByRole("button", { name: "Reply" })).toBeNull();
    expect(screen.queryByRole("button", { name: "View replies" })).toBeNull();
  });

  it("hides cached protected comments after access is denied", () => {
    render(<CommentList discussionId={discussionId} workspaceId={workspaceId} viewer={{ id: "user-1", canAct: false, canManageOthers: false }} query={query([root], { error: { data: { code: "FORBIDDEN" } } })} />);
    expect(screen.getByText("Conversation access restricted")).toBeTruthy();
    expect(screen.queryByText(/Keep the setup context here/)).toBeNull();
  });

  it("retries cursor pagination without losing the loaded comments", () => {
    const result = query([root], { hasNextPage: true, isFetchNextPageError: true, error: new Error("Temporary failure") });
    render(<CommentList discussionId={discussionId} workspaceId={workspaceId} viewer={{ id: "user-2", canAct: true, canManageOthers: false }} query={result} />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(result.fetchNextPage).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Keep the setup context here/)).toBeTruthy();
  });

  it("retries a background refresh while keeping previously loaded comments", () => {
    const result = query([root], { error: new Error("Temporary failure") });
    render(<CommentList discussionId={discussionId} workspaceId={workspaceId} viewer={{ id: "user-2", canAct: true, canManageOthers: false }} query={result} />);
    expect(screen.getByText(/Keep the setup context here/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(result.refetch).toHaveBeenCalledTimes(1);
  });
});
