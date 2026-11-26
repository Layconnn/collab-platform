import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

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

import { WorkspaceActivity, dailySummary } from "./WorkspaceActivity";

const card = (overrides: Record<string, unknown>) => ({
  id: "c000000000000000000000001", name: "Platform", role: "OWNER", lastActivityAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
  decisionsFinalized: 2, discussionsStarted: 3, replies: 11, activePeople: 4, openProposals: 1,
  daily: [0, 1, 4, 0, 2, 6, 3], ...overrides,
});

describe("WorkspaceActivity", () => {
  beforeEach(() => { mocks.workspaces = []; mocks.error = null; mocks.isLoading = false; mocks.refetch.mockReset(); });
  afterEach(() => cleanup());

  it("lists each workspace with its week, in the order given, linking to it", () => {
    mocks.workspaces = [card({}), card({ id: "c000000000000000000000002", name: "Marketing", daily: [1, 0, 0, 0, 0, 0, 0] })];
    render(<WorkspaceActivity />);
    const rows = within(screen.getByRole("list", { name: "Your workspaces" })).getAllByRole("listitem");
    expect(rows.map((row) => within(row).getByRole("link").textContent)).toEqual(["Platform", "Marketing"]);
    expect(within(rows[0]!).getByRole("link").getAttribute("href")).toBe("/workspace/c000000000000000000000001");
    expect(rows[0]!.textContent).toContain("16");
    expect(rows[1]!.textContent).toContain("1");
  });

  it("puts the week in words for screen readers and keeps the bars out of the accessibility tree", () => {
    mocks.workspaces = [card({})];
    render(<WorkspaceActivity />);
    const row = screen.getByRole("listitem");
    const words = row.querySelector(".sr-only")!.textContent!;
    expect(words).toContain("16 events this week.");
    expect(words).toContain("6 days ago: 0 events; 5 days ago: 1 event");
    expect(words).toContain("1 open proposal.");
    expect(words).toContain("Active 2 hours ago.");
    expect(row.querySelector("[aria-hidden='true'].flex")!.children).toHaveLength(7);
  });

  it("says a workspace is quiet instead of drawing empty bars", () => {
    mocks.workspaces = [card({ daily: [0, 0, 0, 0, 0, 0, 0], openProposals: 0, lastActivityAt: null })];
    render(<WorkspaceActivity />);
    const row = screen.getByRole("listitem");
    expect(row.textContent).toContain("Quiet this week");
    expect(row.querySelector(".sr-only")!.textContent).toContain("No activity yet.");
  });

  it("offers a retry when the pulse cannot load", () => {
    mocks.error = { data: { code: "INTERNAL_SERVER_ERROR" } };
    render(<WorkspaceActivity />);
    expect(screen.getByText("Could not load workspaces")).toBeTruthy();
  });

  it("shows a loading state", () => {
    mocks.isLoading = true;
    render(<WorkspaceActivity />);
    expect(screen.getByRole("status", { name: "Loading workspaces" })).toBeTruthy();
  });
});

describe("dailySummary", () => {
  it("reads oldest first and ends with the last 24 hours", () => {
    expect(dailySummary([2, 0, 1])).toBe("2 days ago: 2 events; 1 day ago: 0 events; Last 24 hours: 1 event");
  });
});
