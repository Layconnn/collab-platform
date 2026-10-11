import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChakraProvider } from "@chakra-ui/react";
import { uiSystem } from "@/lib/ui-system";

const mocks = vi.hoisted(() => ({
  userId: "user-2" as string | null,
  role: "MEMBER" as "MEMBER" | "ADMIN" | "OWNER" | null,
  ownerId: "user-3",
  discussionError: null as null | { data: { code: string } },
  commentError: null as null | { data: { code: string } },
  commentEnabled: false,
  loading: false,
  discussionData: {
    id: "c000000000000000000000001",
    workspaceId: "c000000000000000000000002",
    title: "How should first-time setup work?",
    body: "A long-running question.\n@maya can review the setup path.",
    author: { id: "user-1", name: null as string | null, username: "maya" },
    createdAt: new Date("2026-10-01T10:00:00.000Z"),
    updatedAt: new Date("2026-10-01T10:00:00.000Z"),
  },
  update: vi.fn(),
  remove: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ workspaceId: "c000000000000000000000002", discussionId: "c000000000000000000000001" }),
  useRouter: () => ({ replace: mocks.replace }),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: mocks.userId ? { id: mocks.userId } : null }) }));
vi.mock("@/hooks/useWorkspace", () => ({
  useWorkspaceDetail: () => ({ data: { name: "Open Atlas", ownerId: mocks.ownerId }, error: null }),
  useWorkspaceSwitcherList: () => ({ data: { pages: [{ items: mocks.role ? [{ workspaceId: "c000000000000000000000002", role: mocks.role }] : [] }] }, error: null }),
}));
vi.mock("@/hooks/useDiscussion", () => ({
  useDiscussionDetail: () => ({ data: mocks.loading ? null : mocks.discussionData, isLoading: mocks.loading, error: mocks.discussionError }),
  useDiscussionActions: () => ({
    update: { mutateAsync: mocks.update, isPending: false, error: null, reset: vi.fn() },
    remove: { mutateAsync: mocks.remove, isPending: false, error: null },
  }),
}));
vi.mock("@/hooks/useComment", () => ({
  useCommentList: (_discussionId: string, _parentId: string | undefined, enabled: boolean) => {
    mocks.commentEnabled = enabled;
    return { data: { pages: [{ items: [] }] }, error: mocks.commentError, isLoading: false };
  },
}));
vi.mock("@/components/comment/CommentList", () => ({ CommentList: ({ onAccessDenied }: { onAccessDenied: () => void }) => <div>Comment region<button type="button" onClick={onAccessDenied}>Simulate nested access denial</button></div> }));
vi.mock("@/components/comment/CreateCommentForm", () => ({ CreateCommentForm: () => <div>Comment composer</div> }));

import DiscussionDetailPage from "@/app/(workspace)/workspace/[workspaceId]/discussions/[discussionId]/page";

function view() {
  return <ChakraProvider value={uiSystem}><DiscussionDetailPage /></ChakraProvider>;
}

describe("Discussion detail page", () => {
  beforeEach(() => {
    vi.stubGlobal("CSS", { escape: (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "\\$&") });
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
    mocks.userId = "user-2";
    mocks.role = "MEMBER";
    mocks.discussionError = null;
    mocks.commentError = null;
    mocks.loading = false;
    mocks.discussionData.workspaceId = "c000000000000000000000002";
    mocks.discussionData.author.name = null;
    mocks.update.mockReset();
    mocks.remove.mockReset();
    mocks.replace.mockReset();
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("renders plain-text context, mentions, dates, and the author username", () => {
    const { container } = render(view());
    expect(screen.getByRole("heading", { level: 1, name: "How should first-time setup work?" })).toBeTruthy();
    expect(screen.getByText("maya")).toBeTruthy();
    expect(screen.getByText("@maya")).toBeTruthy();
    expect(container.textContent).toContain("A long-running question.\n@maya can review the setup path.");
    expect(screen.getByText("Comment region")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to discussions" })).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Discussion location" })).toBeNull();
  });

  it("does not show cached discussion content after comment access is denied", () => {
    mocks.commentError = { data: { code: "FORBIDDEN" } };
    render(view());
    expect(screen.getByText("Discussion access restricted")).toBeTruthy();
    expect(screen.queryByText("How should first-time setup work?")).toBeNull();
  });

  it("hides the discussion when a nested comment branch loses access", async () => {
    const user = userEvent.setup();
    render(view());
    await user.click(screen.getByRole("button", { name: "Simulate nested access denial" }));
    expect(screen.getByText("Discussion access restricted")).toBeTruthy();
    expect(screen.queryByText("How should first-time setup work?")).toBeNull();
  });

  it("shows a shaped loading state and a safe unavailable state", () => {
    mocks.loading = true;
    const { rerender } = render(view());
    expect(screen.getByRole("status", { name: "Loading discussion" })).toBeTruthy();
    mocks.loading = false;
    mocks.discussionError = { data: { code: "NOT_FOUND" } };
    rerender(view());
    expect(screen.getByText("Discussion unavailable")).toBeTruthy();
  });

  it("does not render a discussion under the wrong workspace URL", () => {
    mocks.discussionData.workspaceId = "c000000000000000000000099";
    render(view());
    expect(screen.getByText("Discussion unavailable")).toBeTruthy();
    expect(screen.queryByText("How should first-time setup work?")).toBeNull();
    expect(mocks.commentEnabled).toBe(false);
  });

  it.each([
    ["author", "user-1", "MEMBER"],
    ["owner", "user-3", "MEMBER"],
    ["admin", "user-4", "ADMIN"],
  ] as const)("allows the %s to access real discussion actions", async (_label, userId, role) => {
    const user = userEvent.setup();
    mocks.userId = userId;
    mocks.role = role;
    render(view());
    await user.click(screen.getByRole("button", { name: "Discussion actions" }));
    expect(await screen.findByRole("menuitem", { name: "Edit discussion" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Delete discussion" })).toBeTruthy();
  });

  it("hides management actions from an ordinary non-author member", () => {
    render(view());
    expect(screen.queryByRole("button", { name: "Discussion actions" })).toBeNull();
  });

  it("confirms deletion before leaving the discussion", async () => {
    const user = userEvent.setup();
    mocks.userId = "user-1";
    mocks.remove.mockResolvedValue({ success: true });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(view());
    await user.click(screen.getByRole("button", { name: "Discussion actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Delete discussion" }));
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith({ discussionId: "c000000000000000000000001" }));
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/workspace/c000000000000000000000002/discussions"));
    confirm.mockRestore();
  });
});
