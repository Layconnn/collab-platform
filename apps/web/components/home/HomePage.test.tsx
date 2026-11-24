import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

const DAY = 24 * 60 * 60 * 1000;
const ws = { id: "c000000000000000000000001", name: "Platform" };

const mocks = vi.hoisted(() => ({
  needs: { items: [] as unknown[], total: 0 },
  needsError: null as null | { data: { code: string } },
  needsAll: [] as boolean[],
  decisions: [] as unknown[],
  decisionsError: null as null | { data: { code: string } },
  dismiss: vi.fn(), dismissAll: vi.fn(), refetch: vi.fn(),
  workspaces: [{ id: "c000000000000000000000001" }] as unknown[],
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1", name: "Maya Okafor", username: "maya" } }) }));
vi.mock("@/hooks/useHome", () => ({
  useNeedsYou: (all: boolean) => { mocks.needsAll.push(all); return { data: mocks.needsError ? undefined : mocks.needs, error: mocks.needsError, isLoading: false, isFetching: false, refetch: mocks.refetch }; },
  useRecentDecisions: () => ({ data: mocks.decisionsError ? undefined : { decisions: mocks.decisions }, error: mocks.decisionsError, isLoading: false, isFetching: false, refetch: mocks.refetch }),
  useWorkspacePulse: () => ({ data: { workspaces: mocks.workspaces }, error: null, isLoading: false }),
  useDismissNeeds: () => ({ dismiss: { mutate: mocks.dismiss, isPending: false }, dismissAll: { mutate: mocks.dismissAll, isPending: false } }),
}));
vi.mock("@/components/home/WorkspaceCards", () => ({ WorkspaceCards: () => <p>Workspace list</p> }));

import { HomePage, greeting, needReason } from "./HomePage";
import { useUiStore } from "@/stores/ui.store";

const need = (overrides: Record<string, unknown>) => ({
  id: `n${Math.random()}`, kind: "MENTION", workspace: ws, title: "Pricing for small teams", actor: "Sam",
  discussionId: "c000000000000000000000002", decisionId: null, at: new Date(Date.now() - 2 * 60 * 60 * 1000),
  notificationId: "c000000000000000000000009", ...overrides,
});

describe("HomePage", () => {
  beforeEach(() => {
    mocks.needs = { items: [], total: 0 }; mocks.needsError = null; mocks.needsAll = [];
    mocks.decisions = []; mocks.decisionsError = null; mocks.workspaces = [{ id: "c000000000000000000000001" }];
    useUiStore.setState({ isCreateWorkspaceOpen: false });
    mocks.dismiss.mockReset(); mocks.dismissAll.mockReset(); mocks.refetch.mockReset();
    window.localStorage.clear();
  });
  afterEach(() => cleanup());

  it("greets the member by first name with today's date", () => {
    render(<HomePage />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/^Good (morning|afternoon|evening), Maya$/);
  });

  it("says when nothing needs the member", () => {
    render(<HomePage />);
    expect(screen.getByRole("heading", { name: "Needs you · 0" })).toBeTruthy();
    expect(screen.getByText("You're all caught up")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Mark all done" })).toBeNull();
  });

  it("lists each kind with its reason, link and urgency", () => {
    mocks.needs = { total: 4, items: [
      need({}),
      need({ id: "w", kind: "PROPOSAL_WAITING", title: "Move to Vercel Queues", decisionId: "c000000000000000000000003", discussionId: null, notificationId: null, at: new Date(Date.now() - 3 * DAY) }),
      need({ id: "r", kind: "REPLY", title: "Which queue?" }),
      need({ id: "o", kind: "OWN_PROPOSAL", title: "Adopt Playwright", actor: "Maya", decisionId: "c000000000000000000000004", discussionId: null, notificationId: null, at: new Date(Date.now() - DAY) }),
    ] };
    render(<HomePage />);
    const rows = within(screen.getByRole("list", { name: "Needs you" })).getAllByRole("listitem");
    expect(rows.map((row) => row.querySelector("p")?.textContent?.split(" · ")[0])).toEqual([
      "Sam mentioned you", "Proposed by Sam", "Sam replied to your discussion", "Your proposal",
    ]);
    expect(rows[1]!.textContent).toContain("waiting 3 days for a decision");
    expect(within(rows[0]!).getByRole("link", { name: "Pricing for small teams" }).getAttribute("href")).toBe(`/workspace/${ws.id}/discussions/c000000000000000000000002`);
    expect(within(rows[1]!).getByRole("link", { name: "Move to Vercel Queues" }).getAttribute("href")).toBe(`/workspace/${ws.id}/decisions/c000000000000000000000003`);
    expect(within(rows[1]!).getByText("Decision needed").className).toContain("bg-danger-action");
    expect(within(rows[3]!).getByText("Your proposal").className).not.toContain("bg-danger-action");
    expect(within(rows[1]!).queryByRole("button")).toBeNull();
  });

  it("marks items done one at a time, all at once, or by opening them", () => {
    mocks.needs = { total: 1, items: [need({})] };
    render(<HomePage />);
    fireEvent.click(screen.getByRole("button", { name: "Mark done: Pricing for small teams" }));
    expect(mocks.dismiss).toHaveBeenCalledWith({ notificationIds: ["c000000000000000000000009"] });
    fireEvent.click(screen.getByRole("button", { name: "Mark all done" }));
    expect(mocks.dismissAll).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("link", { name: "Pricing for small teams" }));
    expect(mocks.dismiss).toHaveBeenCalledTimes(2);
  });

  it("offers the rest when there are more than shown", () => {
    mocks.needs = { total: 23, items: [need({})] };
    render(<HomePage />);
    fireEvent.click(screen.getByRole("button", { name: "Show all 23" }));
    expect(mocks.needsAll.at(-1)).toBe(true);
  });

  it("shows decisions made this week, including replacements", () => {
    mocks.decisions = [
      { decisionId: "d1", workspace: ws, question: "Adopt Playwright", action: "FINALIZED", actor: "Sam", at: new Date(Date.now() - 3 * 60 * 60 * 1000), replacement: null },
      { decisionId: "d2", workspace: ws, question: "Use BullMQ", action: "SUPERSEDED", actor: "Maya", at: new Date(Date.now() - DAY), replacement: { id: "d3", question: "Use Vercel Queues" } },
    ];
    render(<HomePage />);
    const rows = within(screen.getByRole("list", { name: "Decided this week" })).getAllByRole("listitem");
    expect(rows[0]!.textContent).toContain("Finalized by Sam · Platform · 3 hours ago");
    expect(rows[1]!.textContent).toContain("Replaced by Use Vercel Queues · Maya");
    expect(within(rows[1]!).getByRole("link", { name: "Use Vercel Queues" }).getAttribute("href")).toBe(`/workspace/${ws.id}/decisions/d3`);
  });

  it("explains an empty week and keeps other sections when one fails", () => {
    mocks.needsError = { data: { code: "INTERNAL_SERVER_ERROR" } };
    render(<HomePage />);
    expect(screen.getByText("Could not load what needs you")).toBeTruthy();
    expect(screen.getByText(/No decisions this week/)).toBeTruthy();
    expect(screen.getByText("Workspace list")).toBeTruthy();
  });

  it("opens the create dialog from the header", () => {
    render(<HomePage />);
    fireEvent.click(screen.getByRole("button", { name: "New workspace" }));
    expect(useUiStore.getState().isCreateWorkspaceOpen).toBe(true);
  });

  it("guides a member with no workspace to create one or share their username", async () => {
    mocks.workspaces = [];
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<HomePage />);
    expect(screen.getByRole("heading", { name: "Start with a workspace" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /Needs you/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "New workspace" })).toBeNull();
    expect(screen.getByText("maya").tagName).toBe("CODE");
    fireEvent.click(screen.getByRole("button", { name: "Copy username" }));
    expect(writeText).toHaveBeenCalledWith("maya");
    expect(await screen.findByText("Copied")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Create a workspace" }));
    expect(useUiStore.getState().isCreateWorkspaceOpen).toBe(true);
  });

  it("says when the username could not be copied", async () => {
    mocks.workspaces = [];
    Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) }, configurable: true });
    render(<HomePage />);
    fireEvent.click(screen.getByRole("button", { name: "Copy username" }));
    expect(await screen.findByText("Could not copy. Select the username instead.")).toBeTruthy();
  });

  it("offers places opened recently from the palette", () => {
    window.localStorage.setItem("commons.palette.recent", JSON.stringify([{ label: "Open decisions", href: `/workspace/${ws.id}/decisions`, hint: "Platform" }]));
    render(<HomePage />);
    const jump = screen.getByRole("region", { name: "Jump back in" });
    expect(within(jump).getByRole("link", { name: /Open decisions/ }).getAttribute("href")).toBe(`/workspace/${ws.id}/decisions`);
  });
});

describe("Home helpers", () => {
  it("greets by the time of day", () => {
    expect([greeting(3), greeting(8), greeting(14), greeting(20)]).toEqual(["Good evening", "Good morning", "Good afternoon", "Good evening"]);
  });

  it("explains how long a proposal has waited", () => {
    const now = Date.parse("2026-11-23T12:00:00Z");
    expect(needReason(need({ kind: "PROPOSAL_WAITING", at: new Date(now - 30 * 60 * 1000) }) as never, now)).toBe("Proposed by Sam · waiting less than a day for a decision");
    expect(needReason(need({ kind: "OWN_PROPOSAL", at: new Date(now - DAY - 5) }) as never, now)).toBe("Your proposal · open for 1 day");
    expect(needReason(need({ kind: "MENTION", actor: null }) as never, now)).toBe("Someone mentioned you");
  });

  it("puts a review request in words, linking to the decision", () => {
    mocks.needs = { total: 1, items: [need({ id: "rv", kind: "REVIEW_REQUESTED", title: "Offer a free plan", discussionId: null, decisionId: "c000000000000000000000005", notificationId: null, at: new Date(Date.now() - 2 * DAY) })] };
    render(<HomePage />);
    const row = within(screen.getByRole("list", { name: "Needs you" })).getByRole("listitem");
    expect(within(row).getByText("Review requested")).toBeTruthy();
    expect(row.textContent).toContain("Sam asked for your review · waiting 2 days");
    expect(within(row).getByRole("link", { name: "Offer a free plan" }).getAttribute("href")).toBe(`/workspace/${ws.id}/decisions/c000000000000000000000005`);
    expect(within(row).queryByRole("button")).toBeNull();
  });
});
