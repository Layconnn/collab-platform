import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

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
  listNext: false,
  revisionNext: false,
  decision: {
    id: "c000000000000000000000002", workspaceId: "c000000000000000000000001", sourceDiscussionId: "c000000000000000000000003" as string | null,
    sourceDiscussionTitle: "Initial discussion", createdById: "user-1", createdByLabel: "Maya", question: "Which stack?", outcome: "Use TypeScript",
    rationale: "Shared types", alternatives: "Plain JavaScript", followUp: "Document the choice", status: "PROPOSED" as "PROPOSED" | "DECIDED", version: 1,
    decidedAt: null as Date | null, updatedAt: new Date("2026-10-20T10:00:00Z"), createdAt: new Date("2026-10-20T09:00:00Z"),
  },
  create: vi.fn(), edit: vi.fn(), finalize: vi.fn(), push: vi.fn(), listNextPage: vi.fn(), revisionNextPage: vi.fn(), refetch: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useParams: () => ({ workspaceId: mocks.workspaceId, decisionId: mocks.decisionId }), useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: mocks.userId } }) }));
vi.mock("@/hooks/useWorkspace", () => ({ useWorkspaceDetail: () => ({ data: { name: "Open Atlas", viewerRole: mocks.role }, error: mocks.workspaceError }) }));
vi.mock("@/hooks/useDecision", () => ({
  useDecisionList: () => ({ data: { pages: [{ items: [mocks.decision] }] }, error: mocks.listError, isLoading: false, hasNextPage: mocks.listNext, isFetchingNextPage: false, isFetching: false, fetchNextPage: mocks.listNextPage, refetch: mocks.refetch }),
  useDecisionDetail: () => ({ data: mocks.decision, error: mocks.decisionError, isLoading: false, isFetching: false, refetch: mocks.refetch }),
  useDecisionRevisions: () => ({ data: { pages: [{ items: [{ id: "revision-1", version: 1, action: "CREATE", status: "PROPOSED", actorLabel: "Maya", createdAt: new Date("2026-10-20T09:00:00Z"), question: "Which stack?", outcome: "Use TypeScript", rationale: "Shared types", alternatives: null, followUp: null, reason: null }] }] }, error: mocks.revisionError, isLoading: false, hasNextPage: mocks.revisionNext, isFetchingNextPage: false, isFetching: false, fetchNextPage: mocks.revisionNextPage, refetch: mocks.refetch }),
  useDecisionActions: () => ({ create: { mutateAsync: mocks.create, isPending: false, error: null }, edit: { mutateAsync: mocks.edit, isPending: false, error: mocks.editError, reset: vi.fn() }, finalize: { mutateAsync: mocks.finalize, isPending: false, error: mocks.finalizeError, reset: vi.fn() } }),
}));

import DecisionsPage from "@/app/(workspace)/workspace/[workspaceId]/decisions/page";
import DecisionDetailPage from "@/app/(workspace)/workspace/[workspaceId]/decisions/[decisionId]/page";
import { CreateDecisionForm } from "./CreateDecisionForm";

describe("decision frontend flow", () => {
  beforeEach(() => {
    mocks.role = "MEMBER"; mocks.userId = "user-1"; mocks.workspaceError = null; mocks.decisionError = null; mocks.listError = null; mocks.revisionError = null; mocks.editError = null; mocks.finalizeError = null;
    mocks.decision.sourceDiscussionId = "c000000000000000000000003"; mocks.decision.status = "PROPOSED"; mocks.decision.version = 1;
    mocks.decision.outcome = "Use TypeScript"; mocks.decision.rationale = "Shared types";
    mocks.listNext = false; mocks.revisionNext = false;
    mocks.create.mockReset(); mocks.edit.mockReset(); mocks.finalize.mockReset(); mocks.push.mockReset(); mocks.refetch.mockReset(); mocks.listNextPage.mockReset(); mocks.revisionNextPage.mockReset();
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
});
