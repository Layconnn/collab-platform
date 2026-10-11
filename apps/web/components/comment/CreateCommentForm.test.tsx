import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  error: null as (Error & { data?: { code: string } }) | null,
  onCreated: vi.fn(),
  onCancel: vi.fn(),
}));

vi.mock("@/hooks/useComment", () => ({
  useCommentActions: () => ({ create: { mutateAsync: mocks.mutateAsync, isPending: false, get error() { return mocks.error; } } }),
}));

import { CreateCommentForm } from "@/components/comment/CreateCommentForm";

const discussionId = "c000000000000000000000001";
const workspaceId = "c000000000000000000000002";
const parentCommentId = "c000000000000000000000003";

describe("CreateCommentForm", () => {
  beforeEach(() => {
    mocks.mutateAsync.mockReset();
    mocks.onCreated.mockReset();
    mocks.onCancel.mockReset();
    mocks.error = null;
  });
  afterEach(cleanup);

  it("associates shared-schema validation with the comment field", async () => {
    const user = userEvent.setup();
    render(<CreateCommentForm discussionId={discussionId} workspaceId={workspaceId} />);

    await user.click(screen.getByRole("button", { name: "Post comment" }));

    expect(await screen.findByRole("alert")).toHaveProperty("textContent", expect.stringContaining("Write a comment"));
    expect(screen.getByRole("textbox", { name: "Your perspective" }).getAttribute("aria-invalid")).toBe("true");
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
  });

  it("posts a top-level comment and clears the draft", async () => {
    const user = userEvent.setup();
    mocks.mutateAsync.mockResolvedValue({ id: "c000000000000000000000004" });
    render(<CreateCommentForm discussionId={discussionId} workspaceId={workspaceId} onCreated={mocks.onCreated} />);

    await user.type(screen.getByRole("textbox", { name: "Your perspective" }), "A clear next step would help new contributors.");
    await user.click(screen.getByRole("button", { name: "Post comment" }));

    await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ discussionId, body: "A clear next step would help new contributors." })));
    expect(await screen.findByRole("status")).toHaveProperty("textContent", "Comment posted.");
    expect(screen.getByRole("textbox", { name: "Your perspective" })).toHaveProperty("value", "");
    expect(mocks.onCreated).toHaveBeenCalledTimes(1);
  });

  it("focuses an opened reply and preserves its draft after a server failure", async () => {
    const user = userEvent.setup();
    const denied = Object.assign(new Error("internal details"), { data: { code: "FORBIDDEN" } });
    mocks.mutateAsync.mockImplementation(async () => { mocks.error = denied; throw denied; });
    const { rerender } = render(<CreateCommentForm discussionId={discussionId} workspaceId={workspaceId} parentCommentId={parentCommentId} active={false} onCancel={mocks.onCancel} />);
    rerender(<CreateCommentForm discussionId={discussionId} workspaceId={workspaceId} parentCommentId={parentCommentId} active onCancel={mocks.onCancel} />);
    const field = screen.getByRole("textbox", { name: "Your reply" });
    await waitFor(() => expect(document.activeElement).toBe(field));

    await user.type(field, "I can document that flow.");
    await user.click(screen.getByRole("button", { name: "Post reply" }));

    expect(await screen.findByRole("alert")).toHaveProperty("textContent", expect.stringContaining("workspace access changed"));
    expect(screen.queryByText("internal details")).toBeNull();
    expect(field).toHaveProperty("value", "I can document that flow.");
  });

  it("blocks duplicate submissions while a request is in flight", async () => {
    let resolve!: (value: { id: string }) => void;
    mocks.mutateAsync.mockReturnValue(new Promise((done) => { resolve = done; }));
    render(<CreateCommentForm discussionId={discussionId} workspaceId={workspaceId} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Your perspective" }), { target: { value: "Keep the setup instructions together." } });
    const form = screen.getByRole("button", { name: "Post comment" }).closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledTimes(1));
    resolve({ id: "c000000000000000000000004" });
    expect(await screen.findByRole("status")).toBeTruthy();
  });
});
