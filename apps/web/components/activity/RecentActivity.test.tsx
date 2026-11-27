import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

const workspaceId = "c000000000000000000000001";
const mocks = vi.hoisted(() => ({
  items: [] as unknown[],
  error: null as null | { data: { code: string } },
  hasNextPage: false,
  isLoading: false,
  fetchNextPage: vi.fn(),
  refetch: vi.fn(),
  calls: [] as Array<[string, string]>,
}));

vi.mock("@/hooks/useActivity", () => ({
  useWorkspaceActivity: (id: string, filter: string) => {
    mocks.calls.push([id, filter]);
    return {
      data: mocks.isLoading ? undefined : { pages: [{ items: mocks.items, nextCursor: null }] },
      error: mocks.error,
      isLoading: mocks.isLoading,
      isFetching: false,
      hasNextPage: mocks.hasNextPage,
      isFetchingNextPage: false,
      fetchNextPage: mocks.fetchNextPage,
      refetch: mocks.refetch,
    };
  },
}));

import { RecentActivity, describeActivity, timeAgo } from "./RecentActivity";

const event = (overrides: Record<string, unknown>) => ({
  id: `e${Math.random().toString(36).slice(2, 10)}`,
  kind: "DISCUSSION_CREATED",
  createdAt: new Date(Date.now() - 5 * 60_000),
  actor: { id: "u1", label: "Maya" },
  subjectType: "DISCUSSION",
  subjectId: "c000000000000000000000002",
  available: true,
  discussion: { id: "c000000000000000000000002", title: "Pick a queue" },
  summary: { title: "Pick a queue" },
  ...overrides,
});

describe("RecentActivity", () => {
  beforeEach(() => {
    mocks.items = []; mocks.error = null; mocks.hasNextPage = false; mocks.isLoading = false; mocks.calls = [];
    mocks.fetchNextPage.mockReset(); mocks.refetch.mockReset();
  });
  afterEach(() => cleanup());

  it("writes each event as a sentence with a link to its subject", () => {
    mocks.items = [
      event({}),
      event({ kind: "DECISION_FINALIZED", subjectType: "DECISION", subjectId: "c000000000000000000000003", discussion: null, summary: { question: "Use Vercel Queues", status: "DECIDED" } }),
      event({ kind: "MEMBER_ROLE_CHANGED", subjectType: "MEMBER", subjectId: "u2", discussion: null, summary: { member: "Sam", previousRole: "MEMBER", role: "ADMIN" } }),
      event({ kind: "COMMENT_CREATED", subjectType: "COMMENT", subjectId: "c000000000000000000000004", summary: { discussionId: "c000000000000000000000002" } }),
      event({ kind: "MEMBER_REMOVED", subjectType: "MEMBER", subjectId: "u3", discussion: null, summary: { member: "Lee", previousRole: "MEMBER" } }),
      event({ kind: "MEMBER_REMOVED", subjectType: "MEMBER", subjectId: "u1", discussion: null, summary: { member: "Maya", previousRole: "ADMIN", left: true } }),
    ];
    render(<RecentActivity workspaceId={workspaceId} />);
    const rows = within(screen.getByRole("list", { name: "Recent activity" })).getAllByRole("listitem");
    expect(rows.map((row) => row.querySelector("p")?.textContent)).toEqual([
      "Maya started Pick a queue",
      "Maya finalized Use Vercel Queues",
      "Maya changed the role of Sam from member to admin",
      "Maya replied in Pick a queue",
      "Maya removed Lee",
      "Maya left the workspace",
    ]);
    expect(within(rows[0]!).getByRole("link", { name: "Pick a queue" }).getAttribute("href")).toBe(`/workspace/${workspaceId}/discussions/c000000000000000000000002`);
    expect(within(rows[1]!).getByRole("link", { name: "Use Vercel Queues" }).getAttribute("href")).toBe(`/workspace/${workspaceId}/decisions/c000000000000000000000003`);
    expect(rows[0]!.querySelector("time")?.textContent).toBe("5 minutes ago");
  });

  it("keeps deleted subjects as plain text and says when a link is gone", () => {
    mocks.items = [
      event({ available: false, discussion: null }),
      event({ kind: "DECISION_DELETED", subjectType: "DECISION", available: false, discussion: null, summary: { question: "Drop Redis" } }),
      event({ kind: "COMMENT_DELETED", subjectType: "COMMENT", available: false, discussion: null, summary: { discussionId: "gone" } }),
    ];
    render(<RecentActivity workspaceId={workspaceId} />);
    const rows = screen.getAllByRole("listitem");
    expect(rows[0]!.textContent).toContain("Maya started Pick a queue (no longer available)");
    expect(rows[1]!.textContent).toContain("Maya deleted the decision Drop Redis");
    expect(rows[1]!.textContent).not.toContain("no longer available");
    expect(rows[2]!.textContent).toContain("deleted a reply in a deleted discussion");
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("filters by kind and loads more", () => {
    mocks.items = [event({})];
    mocks.hasNextPage = true;
    render(<RecentActivity workspaceId={workspaceId} />);
    expect(screen.getByRole("button", { name: "All" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Decisions" }));
    expect(screen.getByRole("button", { name: "Decisions" }).getAttribute("aria-pressed")).toBe("true");
    expect(mocks.calls.at(-1)).toEqual([workspaceId, "decisions"]);
    fireEvent.click(screen.getByRole("button", { name: "Load more activity" }));
    expect(mocks.fetchNextPage).toHaveBeenCalledOnce();
  });

  it("explains an empty feed", () => {
    render(<RecentActivity workspaceId={workspaceId} />);
    expect(screen.getByText("No activity yet")).toBeTruthy();
  });

  it("offers a retry on errors but hides the feed when access is lost", () => {
    mocks.error = { data: { code: "INTERNAL_SERVER_ERROR" } };
    const view = render(<RecentActivity workspaceId={workspaceId} />);
    fireEvent.click(screen.getByRole("button", { name: /try again|retry/i }));
    expect(mocks.refetch).toHaveBeenCalledOnce();
    mocks.error = { data: { code: "NOT_FOUND" } };
    mocks.items = [event({})];
    view.rerender(<RecentActivity workspaceId={workspaceId} />);
    expect(screen.getByText("Activity unavailable")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Recent activity" })).toBeNull();
  });

  it("formats relative times", () => {
    const now = Date.parse("2026-11-23T12:00:00Z");
    expect(timeAgo(new Date(now - 30_000), now)).toBe("just now");
    expect(timeAgo(new Date(now - 3 * 3_600_000), now)).toBe("3 hours ago");
    expect(timeAgo(new Date(now - 86_400_000), now)).toBe("yesterday");
  });
});

describe("review activity", () => {
  const review = (kind: string, summary: Record<string, unknown>) => event({ kind, subjectType: "DECISION", subjectId: "c000000000000000000000003", discussion: null, summary: { question: "Offer a free plan", ...summary } }) as never;
  const sentence = (item: never) => { const d = describeActivity(item, "c000000000000000000000001"); return [d.lead, d.tail ?? ""]; };

  it("describes review events in plain language", () => {
    expect(sentence(review("DECISION_REVIEW_REQUESTED", { reviewer: "Lee" }))).toEqual(["asked Lee to review", ""]);
    expect(sentence(review("DECISION_REVIEW_RESPONDED", { response: "APPROVED" }))).toEqual(["approved", ""]);
    expect(sentence(review("DECISION_REVIEW_RESPONDED", { response: "OBJECTED", note: "Too low." }))).toEqual(["objected to", ": “Too low.”"]);
    expect(sentence(review("DECISION_REVIEW_WITHDRAWN", { reviewer: "Maya", reason: "left the workspace" }))[0]).toBe("withdrew Maya's review after they left, on");
    expect(sentence(review("DECISION_REVIEWS_RESET", { reviewers: 2 }))[0]).toBe("changed the proposal and asked reviewers again on");
    expect(sentence(review("DECISION_FINALIZED", { overrideReason: "Board date." }))).toEqual(["finalized", "before the review rule was met"]);
  });
});


describe("membership activity", () => {
  const added = (summary: Record<string, unknown>) => event({ kind: "MEMBER_ADDED", subjectType: "MEMBER", subjectId: "c000000000000000000000004", discussion: null, summary }) as never;

  it("says when someone joined with an invite link rather than being added", () => {
    const joined = describeActivity(added({ member: "Lee", role: "MEMBER", via: "invite" }), "c000000000000000000000001");
    expect([joined.lead, joined.tail]).toEqual(["joined with an invite link", "as member"]);
    expect(describeActivity(added({ member: "Lee", role: "ADMIN" }), "c000000000000000000000001").lead).toBe("added");
  });
});
