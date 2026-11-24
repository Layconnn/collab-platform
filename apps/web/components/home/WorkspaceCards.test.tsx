import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  workspaces: [] as unknown[],
  error: null as null | { data: { code: string } },
  isLoading: false,
  refetch: vi.fn(),
}));

vi.mock("@/hooks/useHome", () => ({
  useWorkspacePulse: () => ({
    data: mocks.error || mocks.isLoading ? undefined : { workspaces: mocks.workspaces },
    error: mocks.error, isLoading: mocks.isLoading, isFetching: false, refetch: mocks.refetch,
  }),
}));

import { WorkspaceCards, dailySummary } from "./WorkspaceCards";
import { useUiStore } from "@/stores/ui.store";

const card = (overrides: Record<string, unknown>) => ({
  id: "c000000000000000000000001", name: "Platform", role: "OWNER", lastActivityAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
  decisionsFinalized: 2, discussionsStarted: 3, replies: 11, activePeople: 4, openProposals: 1,
  daily: [0, 1, 4, 0, 2, 6, 3], ...overrides,
});

describe("WorkspaceCards", () => {
  beforeEach(() => { mocks.workspaces = []; mocks.error = null; mocks.isLoading = false; mocks.refetch.mockReset(); });
  afterEach(() => cleanup());

  it("shows each workspace with its role, last activity, figures and chart, in the order given", () => {
    mocks.workspaces = [card({}), card({ id: "c000000000000000000000002", name: "Marketing", role: "MEMBER", lastActivityAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) })];
    render(<WorkspaceCards />);
    const cards = within(screen.getByRole("list", { name: "Your workspaces" })).getAllByRole("listitem");
    expect(cards.map((item) => within(item).getByRole("heading").textContent)).toEqual(["Platform", "Marketing"]);
    expect(within(cards[0]!).getByRole("link", { name: "Platform" }).getAttribute("href")).toBe("/workspace/c000000000000000000000001");
    expect(cards[0]!.textContent).toContain("Owner");
    expect(cards[0]!.textContent).toContain("Active 2 hours ago");
    expect(cards[1]!.textContent).toContain("Member");
    const figures = Object.fromEntries([...cards[0]!.querySelectorAll("dl > div")].map((row) => [row.querySelector("dt")!.textContent, row.querySelector("dd")!.textContent]));
    expect(figures).toEqual({ Decided: "2", "Open proposals": "1", Discussions: "3", Replies: "11", People: "4" });
    expect(screen.getByText("2 workspaces · most active first")).toBeTruthy();
  });

  it("gives the chart a text equivalent and keeps the bars out of the accessibility tree", () => {
    mocks.workspaces = [card({})];
    render(<WorkspaceCards />);
    const caption = screen.getByText(/^Activity per day over the last seven days\./);
    expect(caption.textContent).toContain("6 days ago: 0 events; 5 days ago: 1 event");
    expect(caption.textContent).toContain("Last 24 hours: 3 events.");
    expect(caption.closest("figure")!.querySelector("[aria-hidden='true']")!.children).toHaveLength(7);
  });

  it("says a workspace is quiet instead of showing zeros, keeping its open proposals", () => {
    mocks.workspaces = [card({ decisionsFinalized: 0, discussionsStarted: 0, replies: 0, activePeople: 0, openProposals: 2, daily: [0, 0, 0, 0, 0, 0, 0], lastActivityAt: null })];
    render(<WorkspaceCards />);
    expect(screen.getByText("Quiet this week · 2 open proposals")).toBeTruthy();
    expect(screen.getByText("No activity yet")).toBeTruthy();
    expect(screen.queryByRole("figure")).toBeNull();
    expect(screen.queryByText("Decided")).toBeNull();
  });

  it("invites a first workspace when there are none", () => {
    render(<WorkspaceCards />);
    expect(screen.getByText("Your first workspace starts here.")).toBeTruthy();
    useUiStore.setState({ isCreateWorkspaceOpen: false });
    fireEvent.click(screen.getByRole("button", { name: "Create a workspace" }));
    expect(useUiStore.getState().isCreateWorkspaceOpen).toBe(true);
  });

  it("offers a retry when the pulse cannot load", () => {
    mocks.error = { data: { code: "INTERNAL_SERVER_ERROR" } };
    render(<WorkspaceCards />);
    expect(screen.getByText("Could not load workspaces")).toBeTruthy();
  });

  it("shows a loading state", () => {
    mocks.isLoading = true;
    render(<WorkspaceCards />);
    expect(screen.getByRole("status", { name: "Loading workspaces" })).toBeTruthy();
  });
});

describe("dailySummary", () => {
  it("reads oldest first and ends with the last 24 hours", () => {
    expect(dailySummary([2, 0, 1])).toBe("2 days ago: 2 events; 1 day ago: 0 events; Last 24 hours: 1 event");
  });
});
