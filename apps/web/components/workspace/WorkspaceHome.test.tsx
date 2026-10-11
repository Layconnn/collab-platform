import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  user: { id: "user-1" } as { id: string } | null,
  workspace: null as unknown,
  discussions: null as unknown,
  workspaces: null as unknown,
  members: null as unknown,
  memberEnabled: vi.fn(),
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("@/hooks/useWorkspace", () => ({
  useWorkspaceDetail: () => mocks.workspace,
  useWorkspaceSwitcherList: () => mocks.workspaces,
}));
vi.mock("@/hooks/useDiscussion", () => ({
  useDiscussionList: () => mocks.discussions,
}));
vi.mock("@/hooks/useWorkspaceMembers", () => ({
  useWorkspaceMembers: (_workspaceId: string, enabled: boolean) => {
    mocks.memberEnabled(enabled);
    return { members: mocks.members };
  },
}));

import { WorkspaceHome } from "@/components/workspace/WorkspaceHome";

const createdAt = new Date("2026-03-11T12:00:00.000Z");

function discussion(id: number) {
  return {
    id: `discussion-${id}`,
    title: `Discussion ${id}`,
    author: { id: "user-2", name: "Maya Chen", username: "maya" },
    createdAt,
    updatedAt: createdAt,
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
    mocks.workspaces = {
      data: {
        pages: [{ items: [{ workspaceId: "workspace-1", role: "MEMBER" }] }],
      },
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
