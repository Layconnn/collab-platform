import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  workspaceId: "c000000000000000000000001",
  decisionId: "c000000000000000000000002",
  userId: "user-1",
  role: "MEMBER" as "MEMBER" | "ADMIN" | "OWNER",
  workspaceError: null as null | { data: { code: string } },
  decisionError: null as null | { data: { code: string } },
  listError: null as null | { data: { code: string } },
  revisionError: null as null | { data: { code: string } },
  editError: null as null | { data: { code: string } },
  finalizeError: null as null | { data: { code: string } },
  supersedeError: null as null | { data: { code: string } },
  removeError: null as null | { data: { code: string } },
  supersedePending: false,
  listNext: false,
  revisionNext: false,
  decision: {
    id: "c000000000000000000000002", workspaceId: "c000000000000000000000001", sourceDiscussionId: "c000000000000000000000003" as string | null,
    sourceDiscussionTitle: "Initial discussion", createdById: "user-1", createdByLabel: "Maya", question: "Which stack?", outcome: "Use TypeScript",
    rationale: "Shared types", alternatives: "Plain JavaScript", followUp: "Document the choice", status: "PROPOSED" as "PROPOSED" | "DECIDED" | "SUPERSEDED", version: 1,
    decidedAt: null as Date | null, updatedAt: new Date("2026-10-20T10:00:00Z"), createdAt: new Date("2026-10-20T09:00:00Z"),
    previousDecision: null as null | { id: string; question: string },
    replacementDecision: null as null | { id: string; question: string },
    supersession: null as null | { reason: string; authorizedByLabel: string; createdAt: Date },
  },
  replacementItems: [] as Array<{ id: string; question: string; status: "DECIDED" | "SUPERSEDED"; replacement: null | { replacementDecisionId: string; reason: string; authorizedByLabel: string; createdAt: Date } }>,
  effectiveDecisionId: null as string | null,
  listArgs: [] as unknown[],
  reviews: { summary: { rule: "ALL", needed: 0, active: 0, approved: 0, objected: 0, pending: 0, met: true }, reviews: [] as Array<{ state: string; reviewerLabel: string }> } as unknown,
  create: vi.fn(), edit: vi.fn(), finalize: vi.fn(), supersede: vi.fn(), remove: vi.fn(), push: vi.fn(), listNextPage: vi.fn(), revisionNextPage: vi.fn(), refetch: vi.fn(),
}));

vi.mock("@/components/common/SaveButton", () => ({ SaveButton: () => null }));
vi.mock("next/navigation", () => ({ useParams: () => ({ workspaceId: mocks.workspaceId, decisionId: mocks.decisionId }), useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: mocks.userId } }) }));
vi.mock("@/hooks/useWorkspace", () => ({ useWorkspaceDetail: () => ({ data: { name: "Open Atlas", viewerRole: mocks.role }, error: mocks.workspaceError }) }));
// The Review section has its own tests; here it is a stub with a summary the
// finalize dialog reads.
vi.mock("@/components/decision/DecisionReviews", async (importOriginal) => ({ ...(await importOriginal<object>()), DecisionReviews: () => <p>Review section</p> }));
vi.mock("@/hooks/useDecisionReviews", () => ({
  useDecisionReviews: () => ({ data: mocks.reviews, error: null, isLoading: false }),
}));
vi.mock("@/hooks/useDecision", () => ({
  useDecisionList: (...args: unknown[]) => (mocks.listArgs = args, { data: { pages: [{ items: [mocks.decision] }] }, error: mocks.listError, isLoading: false, hasNextPage: mocks.listNext, isFetchingNextPage: false, isFetching: false, fetchNextPage: mocks.listNextPage, refetch: mocks.refetch }),
  useDecisionDetail: () => ({ data: mocks.decision, error: mocks.decisionError, isLoading: false, isFetching: false, refetch: mocks.refetch }),
  useDecisionRevisions: () => ({ data: { pages: [{ items: [{ id: "revision-1", version: 1, action: "CREATE", status: "PROPOSED", actorLabel: "Maya", createdAt: new Date("2026-10-20T09:00:00Z"), question: "Which stack?", outcome: "Use TypeScript", rationale: "Shared types", alternatives: null, followUp: null, reason: null }] }] }, error: mocks.revisionError, isLoading: false, hasNextPage: mocks.revisionNext, isFetchingNextPage: false, isFetching: false, fetchNextPage: mocks.revisionNextPage, refetch: mocks.refetch }),
  useReplacementHistory: () => ({ data: { items: mocks.replacementItems, truncated: false, effectiveDecisionId: mocks.effectiveDecisionId }, error: null, isLoading: false, isFetching: false, refetch: mocks.refetch }),
  useReplacementCandidates: () => ({ data: { pages: [{ items: [{ id: "c000000000000000000000004", question: "Use a different stack?", outcome: "Use Rust", sourceDiscussionTitle: "Follow-up discussion", version: 2, decidedAt: new Date("2026-10-20T11:00:00Z") }] }] }, error: null, isLoading: false, hasNextPage: false, isFetchingNextPage: false, refetch: mocks.refetch }),
  useDecisionActions: () => ({ create: { mutateAsync: mocks.create, isPending: false, error: null }, edit: { mutateAsync: mocks.edit, isPending: false, error: mocks.editError, reset: vi.fn() }, finalize: { mutateAsync: mocks.finalize, isPending: false, error: mocks.finalizeError, reset: vi.fn() }, supersede: { mutateAsync: mocks.supersede, isPending: mocks.supersedePending, error: mocks.supersedeError, reset: vi.fn() }, remove: { mutateAsync: mocks.remove, isPending: false, error: mocks.removeError, reset: vi.fn() } }),
}));

import DecisionsPage from "@/app/(workspace)/workspace/[workspaceId]/decisions/page";
import DecisionDetailPage from "@/app/(workspace)/workspace/[workspaceId]/decisions/[decisionId]/page";
import { CreateDecisionForm } from "./CreateDecisionForm";

describe("decision frontend flow", () => {
  beforeEach(() => {
    mocks.role = "MEMBER"; mocks.userId = "user-1"; mocks.workspaceError = null; mocks.decisionError = null; mocks.listError = null; mocks.revisionError = null; mocks.editError = null; mocks.finalizeError = null; mocks.supersedeError = null; mocks.supersedePending = false; mocks.removeError = null;
    mocks.decision.sourceDiscussionId = "c000000000000000000000003"; mocks.decision.status = "PROPOSED"; mocks.decision.version = 1;
    mocks.decision.previousDecision = null; mocks.decision.replacementDecision = null; mocks.decision.supersession = null; mocks.replacementItems = []; mocks.effectiveDecisionId = null;
    mocks.decision.outcome = "Use TypeScript"; mocks.decision.rationale = "Shared types";
    mocks.listNext = false; mocks.revisionNext = false;
    mocks.reviews = { summary: { rule: "ALL", needed: 0, active: 0, approved: 0, objected: 0, pending: 0, met: true }, reviews: [] };
    mocks.create.mockReset(); mocks.edit.mockReset(); mocks.finalize.mockReset(); mocks.supersede.mockReset(); mocks.remove.mockReset(); mocks.push.mockReset(); mocks.refetch.mockReset(); mocks.listNextPage.mockReset(); mocks.revisionNextPage.mockReset();
    vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => { fn(0); return 1; });
    vi.stubGlobal("crypto", { randomUUID: vi.fn().mockReturnValueOnce("key-11111111").mockReturnValueOnce("key-22222222") });
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("lists decisions, filters by status, and paginates", () => {
    mocks.listNext = true;
    render(<DecisionsPage />);
    expect(screen.getByRole("link", { name: /Which stack?/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Finalized" }));
    expect(screen.getByRole("button", { name: "Finalized" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Load more decisions" }));
    expect(mocks.listNextPage).toHaveBeenCalledTimes(1);
  });

  it("hides cached index content after access denial", () => {
    mocks.listError = { data: { code: "UNAUTHORIZED" } };
    render(<DecisionsPage />);
    expect(screen.getByText("Decision access restricted")).toBeTruthy();
    expect(screen.queryByText("Which stack?")).toBeNull();
  });

  it("preserves the same idempotency key when retrying an unchanged draft", async () => {
    mocks.create.mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce(mocks.decision);
    render(<CreateDecisionForm workspaceId={mocks.workspaceId} discussionId="c000000000000000000000003" discussionTitle="Initial discussion" onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Decision question"), { target: { value: "Which stack?" } });
    fireEvent.click(screen.getByRole("button", { name: "Save proposal" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save proposal" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Save proposal" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));
    expect(mocks.create.mock.calls[0][0].idempotencyKey).toBe("key-11111111");
    expect(mocks.create.mock.calls[1][0].idempotencyKey).toBe("key-11111111");
    expect(mocks.push).toHaveBeenCalledWith(`/workspace/${mocks.workspaceId}/decisions/${mocks.decisionId}`);
  });

  it("uses a fresh key when the proposal content changes after a failed attempt", async () => {
    mocks.create.mockRejectedValue(new Error("network"));
    render(<CreateDecisionForm workspaceId={mocks.workspaceId} discussionId="c000000000000000000000003" discussionTitle="Initial discussion" onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Decision question"), { target: { value: "Which stack?" } });
    fireEvent.click(screen.getByRole("button", { name: "Save proposal" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save proposal" }).hasAttribute("disabled")).toBe(false));
    fireEvent.change(screen.getByLabelText("Decision question"), { target: { value: "Which language?" } });
    fireEvent.click(screen.getByRole("button", { name: "Save proposal" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));
    expect(mocks.create.mock.calls[0][0].idempotencyKey).toBe("key-11111111");
    expect(mocks.create.mock.calls[1][0].idempotencyKey).toBe("key-22222222");
  });

  it("validates the proposal question", async () => {
    render(<CreateDecisionForm workspaceId={mocks.workspaceId} discussionId="c000000000000000000000003" discussionTitle="Initial discussion" onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Save proposal" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("allows the author to edit but only managers to finalize", () => {
    render(<DecisionDetailPage />);
    expect(screen.getByRole("button", { name: "Edit proposal" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Finalize decision" })).toBeNull();
  });

  it("does not offer edits to another member or finalized records", () => {
    mocks.userId = "user-2";
    const view = render(<DecisionDetailPage />);
    expect(screen.queryByRole("button", { name: "Edit proposal" })).toBeNull();
    mocks.role = "ADMIN"; mocks.decision.status = "DECIDED";
    view.rerender(<DecisionDetailPage />);
    expect(screen.queryByRole("button", { name: "Edit proposal" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Finalize decision" })).toBeNull();
  });

  it("offers a safe refresh on a stale edit without discarding the draft", () => {
    mocks.editError = { data: { code: "CONFLICT" } };
    render(<DecisionDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: "Edit proposal" }));
    fireEvent.change(screen.getByLabelText("Decision question"), { target: { value: "Updated question?" } });
    expect(screen.getByDisplayValue("Updated question?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Refresh latest version/ }));
    expect(mocks.refetch).toHaveBeenCalled();
    expect(screen.getByDisplayValue("Updated question?")).toBeTruthy();
  });

  it("shows deleted-source disclosure and manager finalization confirmation", async () => {
    mocks.role = "ADMIN"; mocks.decision.sourceDiscussionId = null;
    render(<DecisionDetailPage />);
    expect(screen.getByText(/original discussion unavailable/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Finalize decision" }));
    expect(screen.getByRole("dialog", { name: "Finalize this decision?" })).toBeTruthy();
    expect(screen.getByText(/supporting discussion is unavailable/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm finalization" }));
    await waitFor(() => expect(mocks.finalize).toHaveBeenCalledWith({ workspaceId: mocks.workspaceId, decisionId: mocks.decisionId, expectedVersion: 1 }));
  });

  it("keeps keyboard focus in the confirmation and restores it on Escape", () => {
    mocks.role = "OWNER";
    render(<DecisionDetailPage />);
    const trigger = screen.getByRole("button", { name: "Finalize decision" });
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Finalize this decision?" });
    expect(document.activeElement).toBe(dialog);
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("keeps the revision timeline readable and paginated", () => {
    mocks.revisionNext = true;
    render(<DecisionDetailPage />);
    expect(screen.getByText("Proposal created")).toBeTruthy();
    fireEvent.click(screen.getByText("Recorded content"));
    expect(screen.getAllByText("Shared types").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Load more history" }));
    expect(mocks.revisionNextPage).toHaveBeenCalledTimes(1);
  });

  it("offers supersession only to managers of finalized decisions", () => {
    mocks.decision.status = "DECIDED";
    const view = render(<DecisionDetailPage />);
    expect(screen.queryByRole("button", { name: "Supersede decision" })).toBeNull();
    mocks.role = "ADMIN";
    view.rerender(<DecisionDetailPage />);
    expect(screen.getByRole("button", { name: "Supersede decision" })).toBeTruthy();
    mocks.decision.status = "PROPOSED";
    view.rerender(<DecisionDetailPage />);
    expect(screen.queryByRole("button", { name: "Supersede decision" })).toBeNull();
  });

  it("reviews a replacement before submitting both expected versions", async () => {
    mocks.role = "OWNER"; mocks.decision.status = "DECIDED";
    mocks.supersede.mockResolvedValue({ oldDecisionId: mocks.decisionId, replacementDecisionId: "c000000000000000000000004" });
    render(<DecisionDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: "Supersede decision" }));
    const dialog = screen.getByRole("dialog", { name: "Supersede decision" });
    expect(document.activeElement).toBe(dialog);
    expect(screen.getByText("Use Rust")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /Use a different stack/ }));
    fireEvent.change(screen.getByLabelText("Why is this decision being replaced?"), { target: { value: "New constraints require Rust" } });
    fireEvent.click(screen.getByRole("button", { name: "Review replacement" }));
    expect(screen.getByText(/permanent historical metadata/)).toBeTruthy();
    expect(mocks.supersede).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm replacement" }));
    await waitFor(() => expect(mocks.supersede).toHaveBeenCalledWith({ workspaceId: mocks.workspaceId, oldDecisionId: mocks.decisionId, replacementDecisionId: "c000000000000000000000004", expectedOldVersion: 1, expectedReplacementVersion: 2, reason: "New constraints require Rust" }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(`/workspace/${mocks.workspaceId}/decisions/c000000000000000000000004`));
  });

  it("keeps the replacement reason after an API conflict", async () => {
    mocks.role = "ADMIN"; mocks.decision.status = "DECIDED";
    mocks.supersede.mockRejectedValue(new Error("conflict"));
    render(<DecisionDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: "Supersede decision" }));
    fireEvent.click(screen.getByRole("radio", { name: /Use a different stack/ }));
    fireEvent.change(screen.getByLabelText("Why is this decision being replaced?"), { target: { value: "Requirements changed" } });
    fireEvent.click(screen.getByRole("button", { name: "Review replacement" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm replacement" }));
    await waitFor(() => expect(mocks.supersede).toHaveBeenCalledTimes(1));
    mocks.supersedeError = { data: { code: "CONFLICT" } };
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("alert").textContent).toMatch(/review both records/i);
    expect(screen.getByDisplayValue("Requirements changed")).toBeTruthy();
  });

  it("traps focus in the replacement dialog and restores it on Escape", () => {
    mocks.role = "OWNER"; mocks.decision.status = "DECIDED";
    render(<DecisionDetailPage />);
    const trigger = screen.getByRole("button", { name: "Supersede decision" });
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Supersede decision" });
    expect(document.activeElement).toBe(dialog);
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement?.getAttribute("type")).toBe("radio");
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Supersede decision" })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("disables repeat confirmation while supersession is pending", () => {
    mocks.role = "ADMIN"; mocks.decision.status = "DECIDED";
    const view = render(<DecisionDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: "Supersede decision" }));
    fireEvent.click(screen.getByRole("radio", { name: /Use a different stack/ }));
    fireEvent.change(screen.getByLabelText("Why is this decision being replaced?"), { target: { value: "Requirements changed" } });
    fireEvent.click(screen.getByRole("button", { name: "Review replacement" }));
    mocks.supersedePending = true;
    view.rerender(<DecisionDetailPage />);
    expect(screen.getByRole("button", { name: "Replacing..." }).hasAttribute("disabled")).toBe(true);
  });

  it("shows direct replacement context and a separate chain timeline", () => {
    const nextId = "c000000000000000000000004";
    mocks.decision.status = "SUPERSEDED";
    mocks.decision.replacementDecision = { id: nextId, question: "Use Rust?" };
    mocks.decision.supersession = { reason: "The workload changed", authorizedByLabel: "Owner", createdAt: new Date("2026-10-21T09:00:00Z") };
    mocks.replacementItems = [
      { id: mocks.decisionId, question: "Which stack?", status: "SUPERSEDED", replacement: { replacementDecisionId: nextId, reason: "The workload changed", authorizedByLabel: "Owner", createdAt: new Date("2026-10-21T09:00:00Z") } },
      { id: nextId, question: "Use Rust?", status: "DECIDED", replacement: null },
    ];
    mocks.effectiveDecisionId = nextId;
    render(<DecisionDetailPage />);
    expect(screen.getByRole("heading", { name: "Replacement history" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Revision history" })).toBeTruthy();
    expect(screen.getAllByText(/Authorized by Owner/).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Use Rust?" }).length).toBeGreaterThan(0);
  });

  it("offers deletion to the proposal author and to managers, never for linked records", () => {
    const view = render(<DecisionDetailPage />);
    expect(screen.getByRole("button", { name: "Delete proposal" })).toBeTruthy();
    mocks.userId = "user-2";
    view.rerender(<DecisionDetailPage />);
    expect(screen.queryByRole("button", { name: "Delete proposal" })).toBeNull();
    mocks.userId = "user-1"; mocks.decision.status = "DECIDED";
    view.rerender(<DecisionDetailPage />);
    expect(screen.queryByRole("button", { name: "Delete decision" })).toBeNull();
    mocks.role = "ADMIN";
    view.rerender(<DecisionDetailPage />);
    expect(screen.getByRole("button", { name: "Delete decision" })).toBeTruthy();
    mocks.decision.previousDecision = { id: "c000000000000000000000005", question: "Earlier choice" };
    view.rerender(<DecisionDetailPage />);
    expect(screen.queryByRole("button", { name: "Delete decision" })).toBeNull();
  });

  it("confirms deletion with the expected version and returns to the list", async () => {
    mocks.decision.version = 3;
    mocks.remove.mockResolvedValue({ id: mocks.decisionId, workspaceId: mocks.workspaceId });
    render(<DecisionDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: "Delete proposal" }));
    const dialog = screen.getByRole("alertdialog", { name: "Delete this proposal?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(`/workspace/${mocks.workspaceId}/decisions`));
    expect(mocks.remove).toHaveBeenCalledWith({ workspaceId: mocks.workspaceId, decisionId: mocks.decisionId, expectedVersion: 3 });
  });

  it("explains a deletion conflict and closes on Escape", () => {
    mocks.removeError = { data: { code: "CONFLICT" } };
    render(<DecisionDetailPage />);
    const trigger = screen.getByRole("button", { name: "Delete proposal" });
    fireEvent.click(trigger);
    const dialog = screen.getByRole("alertdialog", { name: "Delete this proposal?" });
    expect(within(dialog).getByRole("alert").textContent).toContain("replacement history");
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Delete proposal" }));
  });

  it("asks a manager for a reason before finalizing a proposal whose review rule is not met", async () => {
    mocks.role = "ADMIN";
    mocks.reviews = { summary: { rule: "ALL", needed: 2, active: 2, approved: 1, objected: 0, pending: 1, met: false }, reviews: [{ state: "APPROVED", reviewerLabel: "Sam" }, { state: "PENDING", reviewerLabel: "Lee" }] };
    render(<DecisionDetailPage />);
    expect(screen.getByText("Review section")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Finalize decision" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/Waiting for Lee/)).toBeTruthy();
    const confirm = within(dialog).getByRole("button", { name: "Finalize anyway" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText(/Why finalize anyway/), { target: { value: "Launch date fixed by the board." } });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() => expect(mocks.finalize).toHaveBeenCalledWith({ workspaceId: mocks.workspaceId, decisionId: mocks.decisionId, expectedVersion: 1, overrideReason: "Launch date fixed by the board." }));
  });

  it("shows review progress in the list and filters to proposals waiting for my review", () => {
    (mocks.decision as Record<string, unknown>).review = { rule: "ALL", needed: 2, active: 2, approved: 0, objected: 0, pending: 2, met: false, waitingForMe: true };
    render(<DecisionsPage />);
    expect(screen.getByText("Your review is requested · 0 of 2 approved")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Waiting for my review" }));
    expect(mocks.listArgs).toEqual([mocks.workspaceId, undefined, true]);
    delete (mocks.decision as Record<string, unknown>).review;
  });
});
