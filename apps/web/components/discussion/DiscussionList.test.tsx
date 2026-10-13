import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChakraProvider } from "@chakra-ui/react";
import { uiSystem } from "@/lib/ui-system";

const mocks = vi.hoisted(() => ({
  userId: "user-1" as string | null,
  role: "MEMBER" as "MEMBER" | "ADMIN" | "OWNER" | null,
  workspaceError: null as null | { data: { code: string } },
  removeError: null as Error | null,
  remove: vi.fn(),
  updateError: null as Error | null,
  update: vi.fn(),
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: mocks.userId ? { id: mocks.userId } : null }) }));
vi.mock("@/hooks/useWorkspace", () => ({
  useWorkspaceDetail: () => ({ data: mocks.workspaceError ? null : { viewerRole: mocks.role }, error: mocks.workspaceError }),
}));
vi.mock("@/hooks/useDiscussion", () => ({
  useDiscussionActions: () => ({
    update: { isPending: false, get error() { return mocks.updateError; }, mutateAsync: mocks.update, reset: () => { mocks.updateError = null; } },
    remove: { isPending: false, get error() { return mocks.removeError; }, mutate: mocks.remove },
  }),
}));

import { DiscussionList } from "@/components/discussion/DiscussionList";
import type { useDiscussionList } from "@/hooks/useDiscussion";

const workspaceId = "c000000000000000000000001";
const discussion = {
  id: "c000000000000000000000002",
  workspaceId,
  title: "Keep onboarding decisions together",
  author: { id: "user-2", name: "Maya Chen", username: "maya" },
  createdAt: new Date("2026-10-01T10:00:00.000Z"),
  updatedAt: new Date("2026-10-02T10:00:00.000Z"),
};

function query(overrides: Record<string, unknown> = {}) {
  return {
    data: { pages: [{ items: [discussion], nextCursor: null }] },
    isLoading: false,
    error: null,
    hasNextPage: false,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useDiscussionList>;
}

describe("DiscussionList", () => {
  beforeEach(() => {
    vi.stubGlobal("CSS", { escape: (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "\\$&") });
    vi.stubGlobal("ResizeObserver", class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    mocks.userId = "user-1";
    mocks.role = "MEMBER";
    mocks.workspaceError = null;
    mocks.removeError = null;
    mocks.remove.mockReset();
    mocks.updateError = null;
    mocks.update.mockReset();
  });

  it("shows real row metadata and retains rows after a pagination error", () => {
    const result = query({
      error: new Error("Network unavailable"),
      hasNextPage: true,
      isFetchNextPageError: true,
    });
    render(<DiscussionList workspaceId={workspaceId} query={result} onCreate={vi.fn()} />);

    expect(screen.getByRole("link", { name: /Keep onboarding decisions together/ })).toBeTruthy();
    expect(screen.getByText(/Updated/)).toBeTruthy();
    expect(screen.getByText("Could not load more discussions")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(result.fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("hides cached rows when workspace access is denied", () => {
    render(<DiscussionList workspaceId={workspaceId} query={query()} onCreate={vi.fn()} accessDenied />);

    expect(screen.getByText("Discussion access restricted")).toBeTruthy();
    expect(screen.queryByText(discussion.title)).toBeNull();
  });

  it("opens the composer from the empty state", () => {
    const onCreate = vi.fn();
    render(<DiscussionList workspaceId={workspaceId} query={query({ data: { pages: [{ items: [], nextCursor: null }] } })} onCreate={onCreate} />);

    fireEvent.click(screen.getByRole("button", { name: "Start the first discussion" }));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it("shows a neutral identity when the author has no display name", () => {
    const unnamed = { ...discussion, author: { ...discussion.author, name: null, username: "" } };
    render(<DiscussionList workspaceId={workspaceId} query={query({ data: { pages: [{ items: [unnamed], nextCursor: null }] } })} onCreate={vi.fn()} />);

    expect(screen.getByText("Workspace member")).toBeTruthy();
    expect(screen.queryByText("WM")).toBeNull();
  });

  it("shows a real username when no display name has been set", () => {
    const unnamed = { ...discussion, author: { ...discussion.author, name: null } };
    render(<DiscussionList workspaceId={workspaceId} query={query({ data: { pages: [{ items: [unnamed], nextCursor: null }] } })} onCreate={vi.fn()} />);

    expect(screen.getByText("maya")).toBeTruthy();
    expect(screen.getByText("MA")).toBeTruthy();
    expect(screen.queryByText("Workspace member")).toBeNull();
  });

  it("shows a neutral identity when an author record is unavailable", () => {
    const unavailable = { ...discussion, author: null };
    render(<DiscussionList workspaceId={workspaceId} query={query({ data: { pages: [{ items: [unavailable], nextCursor: null }] } })} onCreate={vi.fn()} />);

    expect(screen.getByText("Unavailable account")).toBeTruthy();
    expect(screen.queryByRole("button", { name: `Actions for ${discussion.title}` })).toBeNull();
  });

  it("hides management actions from an ordinary non-author member", () => {
    render(<DiscussionList workspaceId={workspaceId} query={query()} onCreate={vi.fn()} />);

    expect(screen.queryByRole("button", { name: `Actions for ${discussion.title}` })).toBeNull();
  });

  it.each([
    ["owner", "user-3", "OWNER"],
    ["admin", "user-4", "ADMIN"],
  ] as const)("shows discussion actions to a workspace %s", async (_label, userId, role) => {
    const user = userEvent.setup();
    mocks.userId = userId;
    mocks.role = role;
    render(<ChakraProvider value={uiSystem}><DiscussionList workspaceId={workspaceId} query={query()} onCreate={vi.fn()} /></ChakraProvider>);

    await user.click(screen.getByRole("button", { name: `Actions for ${discussion.title}` }));
    expect(await screen.findByRole("menuitem", { name: "Edit title" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Delete discussion" })).toBeTruthy();
  });

  it("shows admin controls even when the workspace switcher has not loaded that workspace", () => {
    mocks.userId = "user-4";
    mocks.role = "ADMIN";
    render(<ChakraProvider value={uiSystem}><DiscussionList workspaceId={workspaceId} query={query()} onCreate={vi.fn()} /></ChakraProvider>);

    expect(screen.getByRole("button", { name: `Actions for ${discussion.title}` })).toBeTruthy();
  });

  it("does not assume an unknown membership grants management access", () => {
    mocks.role = null;
    render(<DiscussionList workspaceId={workspaceId} query={query()} onCreate={vi.fn()} />);

    expect(screen.queryByRole("button", { name: `Actions for ${discussion.title}` })).toBeNull();
  });

  it("hides cached discussions and actions when workspace access is revoked", () => {
    mocks.workspaceError = { data: { code: "FORBIDDEN" } };
    render(<DiscussionList workspaceId={workspaceId} query={query()} onCreate={vi.fn()} />);

    expect(screen.getByText("Discussion access restricted")).toBeTruthy();
    expect(screen.queryByText(discussion.title)).toBeNull();
  });

  it("shows no actions when the discussion list is unavailable", () => {
    render(<DiscussionList workspaceId={workspaceId} query={query({ data: null, error: new Error("Unavailable") })} onCreate={vi.fn()} />);

    expect(screen.getByText("Could not load discussions")).toBeTruthy();
    expect(screen.queryByRole("button", { name: `Actions for ${discussion.title}` })).toBeNull();
  });

  it("shows author actions and confirms before deleting", async () => {
    const user = userEvent.setup();
    mocks.userId = discussion.author.id;
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<ChakraProvider value={uiSystem}><DiscussionList workspaceId={workspaceId} query={query()} onCreate={vi.fn()} /></ChakraProvider>);

    await user.click(screen.getByRole("button", { name: `Actions for ${discussion.title}` }));
    await user.click(await screen.findByRole("menuitem", { name: "Delete discussion" }));
    await waitFor(() => expect(confirm).toHaveBeenCalledWith("Delete this discussion and its comments?"));
    expect(mocks.remove).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: `Actions for ${discussion.title}` }));
    await user.click(await screen.findByRole("menuitem", { name: "Delete discussion" }));
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith({ discussionId: discussion.id }));
    confirm.mockRestore();
  });

  it("opens the title editor from the author menu", async () => {
    const user = userEvent.setup();
    mocks.userId = discussion.author.id;
    render(<ChakraProvider value={uiSystem}><DiscussionList workspaceId={workspaceId} query={query()} onCreate={vi.fn()} /></ChakraProvider>);

    await user.click(screen.getByRole("button", { name: `Actions for ${discussion.title}` }));
    await user.click(await screen.findByRole("menuitem", { name: "Edit title" }));
    expect(screen.getByRole("textbox", { name: "Edit discussion title" })).toHaveProperty("value", discussion.title);
    expect(screen.queryByRole("link", { name: /Keep onboarding decisions together/ })).toBeNull();
  });

  it("opens and closes the author menu with the keyboard", async () => {
    const user = userEvent.setup();
    mocks.userId = discussion.author.id;
    render(<ChakraProvider value={uiSystem}><DiscussionList workspaceId={workspaceId} query={query()} onCreate={vi.fn()} /></ChakraProvider>);

    const trigger = screen.getByRole("button", { name: `Actions for ${discussion.title}` });
    trigger.focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("menu")).toBeTruthy();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(trigger.getAttribute("aria-expanded")).not.toBe("true"));
  });

  it("reports a rejected deletion and removes stale manager controls after a role change", async () => {
    const user = userEvent.setup();
    mocks.userId = "user-4";
    mocks.role = "ADMIN";
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const onCreate = vi.fn();
    const view = () => <ChakraProvider value={uiSystem}><DiscussionList workspaceId={workspaceId} query={query()} onCreate={onCreate} /></ChakraProvider>;
    const { rerender } = render(view());

    await user.click(screen.getByRole("button", { name: `Actions for ${discussion.title}` }));
    await user.click(await screen.findByRole("menuitem", { name: "Delete discussion" }));
    expect(mocks.remove).toHaveBeenCalledWith({ discussionId: discussion.id });

    mocks.removeError = new Error("Your permission to delete this discussion changed.");
    mocks.role = "MEMBER";
    rerender(view());
    expect(screen.getByRole("alert").textContent).toContain("This discussion could not be deleted. Please try again.");
    expect(screen.queryByRole("button", { name: `Actions for ${discussion.title}` })).toBeNull();
    confirm.mockRestore();
  });

  it("closes editing and reports a backend permission rejection", async () => {
    const user = userEvent.setup();
    mocks.userId = "user-4";
    mocks.role = "ADMIN";
    const denied = Object.assign(new Error("You can no longer edit this discussion."), { data: { code: "FORBIDDEN" } });
    mocks.update.mockImplementation(async () => { mocks.updateError = denied; throw denied; });
    render(<ChakraProvider value={uiSystem}><DiscussionList workspaceId={workspaceId} query={query()} onCreate={vi.fn()} /></ChakraProvider>);

    await user.click(screen.getByRole("button", { name: `Actions for ${discussion.title}` }));
    await user.click(await screen.findByRole("menuitem", { name: "Edit title" }));
    await user.click(screen.getByRole("button", { name: "Save title" }));

    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Your workspace access changed. Refresh before trying again.");
    expect(screen.queryByRole("textbox", { name: "Edit discussion title" })).toBeNull();
  });
});
