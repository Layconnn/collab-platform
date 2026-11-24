import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  data: null as unknown,
  request: vi.fn(), setRule: vi.fn(), withdraw: vi.fn(), respond: vi.fn(),
  members: [] as unknown[],
}));

const mutation = (fn: ReturnType<typeof vi.fn>) => ({ mutate: fn, isPending: false, error: null });
vi.mock("@/hooks/useDecisionReviews", () => ({
  useDecisionReviews: () => ({ data: mocks.data, error: null, isLoading: false, isFetching: false, refetch: vi.fn() }),
  useReviewActions: () => ({ request: mutation(mocks.request), setRule: mutation(mocks.setRule), withdraw: mutation(mocks.withdraw), respond: mutation(mocks.respond) }),
}));
vi.mock("@/hooks/useWorkspaceMembers", () => ({
  useWorkspaceMembers: () => ({ members: { data: { pages: [{ items: mocks.members }] }, isLoading: false, error: null, hasNextPage: false } }),
}));

import { DecisionReviews, reviewEventText, reviewProgress } from "./DecisionReviews";

const ws = "c000000000000000000000001", decision = "c000000000000000000000002";
const member = (userId: string, name: string, username: string) => ({ userId, user: { id: userId, name, username } });
const review = (overrides: Record<string, unknown>) => ({
  reviewerId: "maya", reviewerLabel: "Maya", requestedByLabel: "Sam", state: "PENDING", note: null, respondedVersion: null,
  respondedAt: null, createdAt: new Date("2026-11-24T09:00:00Z"), stale: false, ...overrides,
});
const view = (overrides: Record<string, unknown> = {}) => ({
  decisionVersion: 3,
  summary: { rule: "ALL", needed: 2, active: 2, approved: 1, objected: 0, pending: 1, met: false },
  requiredApprovals: null,
  reviews: [review({ state: "APPROVED", respondedAt: new Date("2026-11-24T10:00:00Z"), respondedVersion: 3 }), review({ reviewerId: "lee", reviewerLabel: "Lee" })],
  history: [],
  viewer: { canManage: false, canRespond: false, review: null },
  ...overrides,
});

describe("DecisionReviews", () => {
  beforeEach(() => {
    mocks.data = view(); mocks.members = [];
    mocks.request.mockReset(); mocks.setRule.mockReset(); mocks.withdraw.mockReset(); mocks.respond.mockReset();
  });
  afterEach(() => cleanup());

  it("shows progress, the rule and every reviewer's state in words", () => {
    render(<DecisionReviews workspaceId={ws} decisionId={decision} authorId="sam" />);
    expect(screen.getByRole("heading", { name: "Review · 1 of 2 approved" })).toBeTruthy();
    expect(screen.getByText(/Everyone asked must approve/)).toBeTruthy();
    const rows = within(screen.getByRole("list", { name: "Reviewers" })).getAllByRole("listitem");
    expect(rows.map((row) => row.textContent)).toEqual([expect.stringContaining("MayaApproved"), expect.stringContaining("LeeWaiting")]);
    expect(screen.queryByRole("button", { name: "Request review" })).toBeNull();
  });

  it("lets the author ask members who are not the author or already asked, with a rule", () => {
    mocks.data = view({ viewer: { canManage: true, canRespond: false, review: null } });
    mocks.members = [member("sam", "Sam", "sam"), member("maya", "Maya", "maya"), member("lee", "Lee", "lee"), member("kim", "Kim", "kim")];
    render(<DecisionReviews workspaceId={ws} decisionId={decision} authorId="sam" />);
    fireEvent.click(screen.getByRole("button", { name: "Request review" }));
    const dialog = screen.getByRole("dialog", { name: "Request review" });
    const boxes = within(dialog).getAllByRole("checkbox");
    expect(boxes.map((box) => box.closest("label")?.textContent)).toEqual(["Kim@kim"]);
    fireEvent.click(boxes[0]!);
    fireEvent.click(within(dialog).getByRole("radio", { name: /When at least/ }));
    fireEvent.change(within(dialog).getByLabelText("Approvals needed"), { target: { value: "2" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Ask 1 person" }));
    expect(mocks.request).toHaveBeenCalledWith({ workspaceId: ws, decisionId: decision, reviewerIds: ["kim"], rule: { rule: "AT_LEAST", requiredApprovals: 2 } }, expect.anything());
  });

  it("lets a manager withdraw a request", () => {
    mocks.data = view({ viewer: { canManage: true, canRespond: false, review: null } });
    render(<DecisionReviews workspaceId={ws} decisionId={decision} authorId="sam" />);
    fireEvent.click(screen.getByRole("button", { name: "Withdraw review request to Lee" }));
    expect(mocks.withdraw).toHaveBeenCalledWith({ workspaceId: ws, decisionId: decision, reviewerId: "lee" });
  });

  it("asks a reviewer for a reason before objecting, and answers on the version shown", () => {
    mocks.data = view({ viewer: { canManage: false, canRespond: true, review: { state: "PENDING", note: null } } });
    render(<DecisionReviews workspaceId={ws} decisionId={decision} authorId="sam" />);
    const form = screen.getByRole("form", { name: "Your review" });
    fireEvent.click(within(form).getByRole("radio", { name: "Object" }));
    fireEvent.click(within(form).getByRole("button", { name: "Object" }));
    expect(mocks.respond).not.toHaveBeenCalled();
    expect(within(form).getByRole("alert").textContent).toMatch(/Say why you object/);
    fireEvent.change(within(form).getByLabelText("Why do you object?"), { target: { value: "Five is too low." } });
    fireEvent.click(within(form).getByRole("button", { name: "Object" }));
    expect(mocks.respond).toHaveBeenCalledWith({ workspaceId: ws, decisionId: decision, expectedVersion: 3, response: "OBJECTED", note: "Five is too low." }, expect.anything());
  });

  it("shows an earlier answer with a way to change it", () => {
    mocks.data = view({ viewer: { canManage: false, canRespond: true, review: { state: "APPROVED", note: null } } });
    render(<DecisionReviews workspaceId={ws} decisionId={decision} authorId="sam" />);
    expect(screen.getByText("You approved this version.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Change your review" }));
    expect(screen.getByRole("form", { name: "Your review" })).toBeTruthy();
  });

  it("marks answers given to an earlier version and invites the author to ask when nobody is asked", () => {
    mocks.data = view({ reviews: [review({ state: "APPROVED", stale: true, respondedAt: new Date() })] });
    render(<DecisionReviews workspaceId={ws} decisionId={decision} authorId="sam" />);
    expect(screen.getByText("answered an earlier version")).toBeTruthy();
    cleanup();
    mocks.data = view({ summary: { rule: "ALL", needed: 0, active: 0, approved: 0, objected: 0, pending: 0, met: true }, reviews: [], viewer: { canManage: true, canRespond: false, review: null } });
    render(<DecisionReviews workspaceId={ws} decisionId={decision} authorId="sam" />);
    expect(screen.getByRole("heading", { name: "Review · No reviewers yet" })).toBeTruthy();
    expect(screen.getByText(/Ask teammates to approve or object/)).toBeTruthy();
  });
});

describe("review wording", () => {
  it("describes progress and history in plain language", () => {
    expect(reviewProgress({ rule: "AT_LEAST", needed: 2, active: 3, approved: 1, objected: 1, pending: 1, met: false })).toBe("1 of 2 approvals needed");
    expect(reviewEventText({ kind: "DECISION_REVIEW_REQUESTED", actorLabel: "Sam", summary: { reviewer: "Lee" } })).toBe("Sam asked Lee to review");
    expect(reviewEventText({ kind: "DECISION_REVIEW_RESPONDED", actorLabel: "Lee", summary: { response: "OBJECTED", previous: "PENDING", note: "Too low.", version: 1 } })).toBe("Lee objected version 1: “Too low.”");
    expect(reviewEventText({ kind: "DECISION_REVIEW_RESPONDED", actorLabel: "Lee", summary: { response: "APPROVED", previous: "OBJECTED", version: 3 } })).toBe("Lee approved version 3 (changed from objected)");
    expect(reviewEventText({ kind: "DECISION_REVIEWS_RESET", actorLabel: "Sam", summary: { reviewers: 2 } })).toBe("Sam changed the proposal, so 2 reviewers were asked again");
    expect(reviewEventText({ kind: "DECISION_REVIEW_WITHDRAWN", actorLabel: "Olu", summary: { reviewer: "Maya", reason: "left the workspace" } })).toBe("Maya left the workspace, so their review was withdrawn");
    expect(reviewEventText({ kind: "DECISION_REVIEW_RULE_CHANGED", actorLabel: "Sam", summary: { rule: "AT_LEAST", requiredApprovals: 2 } })).toBe("Sam set the rule to at least 2 approvals");
  });
});
