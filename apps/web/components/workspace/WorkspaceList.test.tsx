import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ query: null as unknown }));
vi.mock("@/hooks/useWorkspace", () => ({
  useWorkspaceSwitcherList: () => mocks.query,
}));

import { WorkspaceList } from "@/components/workspace/WorkspaceList";

describe("WorkspaceList", () => {
  beforeEach(() => {
    mocks.query = {
      data: {
        pages: [
          {
            items: [
              {
                workspaceId: "workspace-1",
                name: "Open Atlas",
                slug: "open-atlas",
                role: "OWNER",
              },
            ],
            nextCursor: null,
          },
        ],
      },
      isLoading: false,
      error: null,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    };
  });
  afterEach(cleanup);

  it("links to real workspaces and shows their role", () => {
    render(<WorkspaceList />);
    expect(
      screen.getByRole("link", { name: /Open Atlas/ }).getAttribute("href"),
    ).toBe("/workspace/workspace-1");
    expect(screen.getByText("Owner")).toBeTruthy();
  });

  it("loads additional pages without claiming an exact total", () => {
    const query = mocks.query as Record<string, unknown>;
    query.hasNextPage = true;
    render(<WorkspaceList />);
    expect(screen.getByText("1+ workspaces")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Load more workspaces" }),
    );
    expect(query.fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("connects the empty state to the actual create form", () => {
    const query = mocks.query as Record<string, unknown>;
    query.data = { pages: [{ items: [], nextCursor: null }] };
    render(<WorkspaceList />);
    expect(
      screen
        .getByRole("link", { name: /Create a workspace/ })
        .getAttribute("href"),
    ).toBe("#new-workspace");
  });

  it("does not mistake a failed refresh of an empty cache for a genuine empty directory", () => {
    const query = mocks.query as Record<string, unknown>;
    query.data = { pages: [{ items: [], nextCursor: null }] };
    query.error = new Error("Connection unavailable");
    render(<WorkspaceList />);
    expect(screen.getByText("Could not refresh workspaces")).toBeTruthy();
    expect(screen.queryByText("Your first workspace starts here.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(query.refetch).toHaveBeenCalledTimes(1);
  });
});
