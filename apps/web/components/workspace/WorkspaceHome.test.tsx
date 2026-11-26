import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  user: { id: "user-1" } as { id: string } | null,
  workspace: null as unknown,
  discussions: null as unknown,
  members: null as unknown,
  memberEnabled: vi.fn(),
  pulse: [] as unknown[],
  decisions: [] as unknown[],
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("@/hooks/useWorkspace", () => ({
  useWorkspaceDetail: () => mocks.workspace,
}));
vi.mock("@/hooks/useDiscussion", () => ({
  useDiscussionList: () => mocks.discussions,
}));
// The activity panel has its own tests; here it only needs an empty feed.
vi.mock("@/hooks/useActivity", () => ({
  useWorkspaceActivity: () => ({ data: { pages: [{ items: [], nextCursor: null }] }, error: null, isLoading: false, isFetching: false, hasNextPage: false, isFetchingNextPage: false, refetch: vi.fn(), fetchNextPage: vi.fn() }),
}));
vi.mock("@/hooks/useHome", () => ({ useWorkspacePulse: () => ({ data: { workspaces: mocks.pulse } }) }));
vi.mock("@/hooks/useDecision", () => ({ useDecisionList: () => ({ data: { pages: [{ items: mocks.decisions }] }, error: null, isLoading: false }) }));
vi.mock("@/hooks/useWorkspaceMembers", () => ({
  useWorkspaceMembers: (_workspaceId: string, enabled: boolean) => {
    mocks.memberEnabled(enabled);
    return { members: mocks.members };
  },
}));

import { WorkspaceHome } from "@/components/workspace/WorkspaceHome";
import { TopBarSlotProvider } from "@/components/shell/TopBarActions";

const createdAt = new Date("2026-03-11T12:00:00.000Z");

function discussion(id: number) {
  return {
    id: `discussion-${id}`,
    title: `Discussion ${id}`,
    author: { id: "user-2", name: "Maya Chen", username: "maya" },
    createdAt,
    updatedAt: createdAt,
    files: 0,
    replies: 0,
    lastReplyAt: null,
    participants: [],
    decision: null,
  };
}

describe("WorkspaceHome", () => {
  beforeEach(() => {
    mocks.user = { id: "user-1" };
    mocks.memberEnabled.mockReset();
    mocks.workspace = {
      data: {
        id: "workspace-1",
        name: "Open Atlas",
        slug: "open-atlas",
        ownerId: "user-2",
        viewerRole: "MEMBER",
        createdAt,
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    };
    mocks.discussions = {
      data: { pages: [{ items: [], nextCursor: null }] },
      isLoading: false,
      isError: false,
      error: null,
      hasNextPage: false,
      refetch: vi.fn(),
    };
    mocks.members = {
      data: undefined,
      isLoading: false,
      error: null,
      hasNextPage: false,
      refetch: vi.fn(),
    };
  });
  afterEach(cleanup);

  it("offers a real first-discussion action without requesting a restricted roster", () => {
    render(<WorkspaceHome workspaceId="workspace-1" />);

    expect(screen.getByRole("heading", { name: "Open Atlas" })).toBeTruthy();
    expect(screen.getByText("Begin with a clear question.")).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Start the first discussion" })
        .getAttribute("href"),
    ).toBe("/workspace/workspace-1/discussions#new-discussion");
    expect(screen.queryByRole("heading", { name: "Contributors" })).toBeNull();
    expect(mocks.memberEnabled).toHaveBeenCalledWith(false);
  });

  it("shows the contributor section to an admin without a loaded workspace switcher entry", () => {
    mocks.workspace = {
      data: {
        id: "workspace-1",
        name: "Open Atlas",
        slug: "open-atlas",
        ownerId: "user-2",
        viewerRole: "ADMIN",
        createdAt,
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    };
    render(<WorkspaceHome workspaceId="workspace-1" />);

    expect(mocks.memberEnabled).toHaveBeenCalledWith(true);
    expect(screen.getByRole("heading", { name: "Contributors" })).toBeTruthy();
  });

  it("shows only the six most recent rows and marks paginated counts as lower bounds", () => {
    mocks.discussions = {
      data: {
        pages: [
          {
            items: Array.from({ length: 20 }, (_, index) =>
              discussion(index + 1),
            ),
            nextCursor: "next",
          },
        ],
      },
      isLoading: false,
      isError: false,
      error: null,
      hasNextPage: true,
      refetch: vi.fn(),
    };
    render(<WorkspaceHome workspaceId="workspace-1" />);

    expect(screen.getByText("20+ discussions")).toBeTruthy();
    expect(screen.getByText("Discussion 1")).toBeTruthy();
    expect(screen.queryByText("Discussion 7")).toBeNull();
    expect(
      screen
        .getByRole("link", { name: /View all discussions/ })
        .getAttribute("href"),
    ).toBe("/workspace/workspace-1/discussions");
  });

  it("shows actual contributor data to a known owner", () => {
    mocks.workspace = {
      data: {
        id: "workspace-1",
        name: "Open Atlas",
        slug: "open-atlas",
        ownerId: "user-1",
        viewerRole: "OWNER",
        createdAt,
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    };
    mocks.members = {
      data: {
        pages: [
          {
            items: [
              {
                id: "membership-1",
                userId: "user-1",
                role: "OWNER",
                user: {
                  id: "user-1",
                  name: null,
                  username: "maya",
                  email: "maya@example.com",
                },
              },
            ],
            nextCursor: null,
          },
        ],
      },
      isLoading: false,
      error: null,
      hasNextPage: false,
      refetch: vi.fn(),
    };
    render(<WorkspaceHome workspaceId="workspace-1" />);

    expect(mocks.memberEnabled).toHaveBeenCalledWith(true);
    expect(screen.getByRole("heading", { name: "Contributors" })).toBeTruthy();
    expect(screen.getByText("1 contributor")).toBeTruthy();
    expect(screen.getByText("maya")).toBeTruthy();
    expect(screen.queryByText("maya@example.com")).toBeNull();
  });

  it("renders a contextual skeleton while workspace details load", () => {
    mocks.workspace = {
      data: undefined,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    };
    render(<WorkspaceHome workspaceId="workspace-1" />);

    expect(screen.getByRole("status").textContent).toContain(
      "Loading workspace home",
    );
    expect(screen.queryByRole("heading", { name: "Open Atlas" })).toBeNull();
  });

  it("does not reveal workspace content after access is denied", () => {
    mocks.workspace = {
      data: undefined,
      isLoading: false,
      error: { data: { code: "FORBIDDEN" } },
      refetch: vi.fn(),
    };
    render(<WorkspaceHome workspaceId="workspace-1" />);

    expect(screen.getByText("Workspace access restricted")).toBeTruthy();
    expect(screen.queryByText("Begin with a clear question.")).toBeNull();
    expect(
      screen.getByRole("link", { name: "All workspaces" }).getAttribute("href"),
    ).toBe("/workspace");
  });

  it("hides cached workspace details after access is revoked", () => {
    mocks.workspace = {
      data: {
        id: "workspace-1",
        name: "Open Atlas",
        slug: "open-atlas",
        ownerId: "user-2",
        createdAt,
      },
      isLoading: false,
      error: { data: { code: "FORBIDDEN" } },
      refetch: vi.fn(),
    };
    render(<WorkspaceHome workspaceId="workspace-1" />);

    expect(screen.getByText("Workspace access restricted")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Open Atlas" })).toBeNull();
  });

  it("does not show a cached contributor roster after a permission error", () => {
    mocks.workspace = {
      data: {
        id: "workspace-1",
        name: "Open Atlas",
        slug: "open-atlas",
        ownerId: "user-1",
        viewerRole: "OWNER",
        createdAt,
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    };
    mocks.members = {
      data: {
        pages: [
          {
            items: [
              {
                id: "membership-1",
                userId: "user-2",
                role: "ADMIN",
                user: {
                  id: "user-2",
                  name: "Maya Chen",
                  username: "maya",
                  email: "maya@example.com",
                },
              },
            ],
            nextCursor: null,
          },
        ],
      },
      isLoading: false,
      error: { data: { code: "FORBIDDEN" } },
      hasNextPage: false,
      refetch: vi.fn(),
    };
    render(<WorkspaceHome workspaceId="workspace-1" />);

    expect(screen.getByText("Contributor access restricted")).toBeTruthy();
    expect(screen.queryByText("Maya Chen")).toBeNull();
  });
});

describe("WorkspaceHome, redesigned", () => {
  afterEach(() => { cleanup(); mocks.pulse = []; mocks.decisions = []; });

  const slot = () => document.getElementById("top-bar") ?? Object.assign(document.body.appendChild(document.createElement("div")), { id: "top-bar" });
  const ready = () => {
    mocks.workspace = { data: { id: "c000000000000000000000001", name: "Open Atlas", slug: "open-atlas", viewerRole: "MEMBER", createdAt: new Date("2026-03-11T12:00:00.000Z") }, error: null, isLoading: false };
    mocks.discussions = { data: { pages: [{ items: [] }] }, error: null, isLoading: false, hasNextPage: false };
    mocks.members = { data: undefined, error: null, isLoading: false };
  };

  it("puts the workspace's actions in the top bar and says who you are in it", () => {
    ready();
    render(<TopBarSlotProvider slot={slot()}><WorkspaceHome workspaceId="c000000000000000000000001" /></TopBarSlotProvider>);
    expect(screen.getByRole("link", { name: "Start a discussion" }).getAttribute("href")).toBe("/workspace/c000000000000000000000001/discussions#new-discussion");
    expect(screen.getByText("Workspace · /open-atlas")).toBeTruthy();
    expect(screen.getByText("You are a member")).toBeTruthy();
  });

  it("shows this week's figures with a text equivalent of the chart", () => {
    ready();
    mocks.pulse = [{ id: "c000000000000000000000001", name: "Open Atlas", role: "MEMBER", lastActivityAt: null, decisionsFinalized: 2, discussionsStarted: 3, replies: 11, activePeople: 4, openProposals: 1, daily: [0, 1, 4, 0, 2, 6, 3] }];
    render(<WorkspaceHome workspaceId="c000000000000000000000001" />);
    const week = screen.getByRole("region", { name: "This week" });
    const figures = Object.fromEntries([...week.querySelectorAll("dl > div")].map((row) => [row.querySelector("dt")!.textContent, row.querySelector("dd")!.textContent]));
    expect(figures).toEqual({ Decided: "2", "Open proposals": "1", Discussions: "3", Replies: "11", "People active": "4" });
    expect(week.querySelector("figcaption")!.textContent).toContain("Last 24 hours: 3 events");
  });

  it("links the latest decisions with their status", () => {
    ready();
    mocks.decisions = [{ id: "d1", question: "Adopt Playwright", status: "DECIDED", createdByLabel: "Maya", updatedAt: new Date() }];
    render(<WorkspaceHome workspaceId="c000000000000000000000001" />);
    const section = screen.getByRole("region", { name: "Latest decisions" });
    expect(section.querySelector("a[href='/workspace/c000000000000000000000001/decisions/d1']")!.textContent).toContain("DecidedAdopt Playwright");
  });
});
