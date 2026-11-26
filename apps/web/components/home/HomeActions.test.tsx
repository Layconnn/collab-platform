import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

type Mutation = {
  mutate: ReturnType<typeof vi.fn>; reset: ReturnType<typeof vi.fn>;
  isPending: boolean; isSuccess: boolean; error: null | { data: { code: string } }; variables?: Record<string, unknown>;
};
const mutation = (): Mutation => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, isSuccess: false, error: null });

const mocks = vi.hoisted(() => ({
  respond: null as unknown as Mutation,
  create: null as unknown as Mutation,
  createOptions: null as null | { onSuccess: () => void },
  invalidateComments: vi.fn(),
}));

vi.mock("@/hooks/useDecisionReviews", () => ({ useReviewActions: () => ({ respond: mocks.respond }) }));
vi.mock("@/lib/trpc/api-client", () => ({
  trpc: {
    useUtils: () => ({ comment: { invalidate: mocks.invalidateComments } }),
    comment: { create: { useMutation: (options: { onSuccess: () => void }) => { mocks.createOptions = options; return mocks.create; } } },
  },
}));

import { QuickReply, ReviewActions } from "./HomeActions";

const ids = { workspaceId: "c000000000000000000000001", decisionId: "c000000000000000000000002" };
const review = <ReviewActions {...ids} version={3} href="/workspace/w/decisions/d" title="Flat pricing" />;

describe("ReviewActions", () => {
  beforeEach(() => { mocks.respond = mutation(); });
  afterEach(cleanup);

  it("approves the version the member saw", () => {
    render(review);
    fireEvent.click(screen.getByRole("button", { name: "Approve Flat pricing" }));
    expect(mocks.respond.mutate).toHaveBeenCalledWith({ ...ids, expectedVersion: 3, response: "APPROVED" });
  });

  it("asks why before sending an objection", () => {
    render(review);
    fireEvent.click(screen.getByRole("button", { name: "Object to Flat pricing" }));
    const send = screen.getByRole("button", { name: "Send objection" }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Why do you object?"), { target: { value: "  Too cheap for large teams  " } });
    fireEvent.click(send);
    expect(mocks.respond.mutate).toHaveBeenCalledWith({ ...ids, expectedVersion: 3, response: "OBJECTED", note: "Too cheap for large teams" });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Approve Flat pricing" })).toBeTruthy();
  });

  it("says when the proposal changed and links to it", () => {
    mocks.respond.error = { data: { code: "CONFLICT" } };
    render(review);
    expect(screen.getByRole("alert").textContent).toContain("This proposal changed since you loaded it.");
    expect(screen.getByRole("link", { name: "Open it" }).getAttribute("href")).toBe("/workspace/w/decisions/d");
  });

  it("says when the review is no longer needed, or failed", () => {
    mocks.respond.error = { data: { code: "NOT_FOUND" } };
    const { rerender } = render(review);
    expect(screen.getByRole("alert").textContent).toBe("Your review is no longer needed on this proposal.");
    mocks.respond.error = { data: { code: "INTERNAL_SERVER_ERROR" } };
    rerender(<ReviewActions {...ids} version={3} href="/x" title="Flat pricing" />);
    expect(screen.getByRole("alert").textContent).toBe("Could not send your review. Please try again.");
  });

  it("confirms what was sent", () => {
    mocks.respond.isSuccess = true;
    mocks.respond.variables = { response: "OBJECTED" };
    render(review);
    expect(screen.getByRole("status").textContent).toBe("Objection sent");
  });
});

describe("QuickReply", () => {
  beforeEach(() => { mocks.create = mutation(); mocks.createOptions = null; mocks.invalidateComments.mockReset(); });
  afterEach(cleanup);

  it("replies in the thread with one key per text, then marks the item done", () => {
    const onReplied = vi.fn();
    render(<QuickReply discussionId="c000000000000000000000003" parentCommentId="c000000000000000000000004" actor="Sam" onReplied={onReplied} />);
    const input = screen.getByLabelText("Reply to Sam");
    expect((screen.getByRole("button", { name: "Reply" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(input, { target: { value: " Checked it, B works " } });
    fireEvent.submit(input.closest("form")!);
    fireEvent.submit(input.closest("form")!);
    const [first, second] = mocks.create.mutate.mock.calls.map(([args]) => args);
    expect(first).toMatchObject({ discussionId: "c000000000000000000000003", parentCommentId: "c000000000000000000000004", body: "Checked it, B works" });
    expect(second.idempotencyKey).toBe(first.idempotencyKey);
    fireEvent.change(input, { target: { value: "Something else" } });
    fireEvent.submit(input.closest("form")!);
    expect(mocks.create.mutate.mock.calls[2]![0].idempotencyKey).not.toBe(first.idempotencyKey);

    mocks.createOptions!.onSuccess();
    expect(onReplied).toHaveBeenCalledOnce();
    expect(mocks.invalidateComments).toHaveBeenCalled();
  });

  it("replies to the discussion itself when there is no comment, and keeps the text on failure", () => {
    mocks.create.error = { data: { code: "INTERNAL_SERVER_ERROR" } };
    render(<QuickReply discussionId="c000000000000000000000003" parentCommentId={null} actor={null} onReplied={() => {}} />);
    const input = screen.getByLabelText("Reply to this");
    fireEvent.change(input, { target: { value: "Thanks" } });
    fireEvent.submit(input.closest("form")!);
    expect(mocks.create.mutate.mock.calls[0]![0]).not.toHaveProperty("parentCommentId");
    expect(screen.getByRole("alert").textContent).toBe("Could not send your reply. Your text is still here.");
    expect((input as HTMLInputElement).value).toBe("Thanks");
  });
});
