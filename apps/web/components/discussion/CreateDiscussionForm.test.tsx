import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  onCancel: vi.fn(),
  error: null as Error | null,
}));

vi.mock("@/hooks/useDiscussion", () => ({
  useDiscussionActions: () => ({ create: {
    mutateAsync: mocks.mutateAsync,
    isPending: false,
    get error() { return mocks.error; },
  } }),
}));

import { CreateDiscussionForm } from "@/components/discussion/CreateDiscussionForm";

const workspaceId = "c000000000000000000000001";

describe("CreateDiscussionForm", () => {
  beforeEach(() => {
    mocks.mutateAsync.mockReset();
    mocks.onCancel.mockReset();
    mocks.error = null;
  });
  afterEach(cleanup);

  it("associates shared-schema validation with title and body", async () => {
    const user = userEvent.setup();
    render(<CreateDiscussionForm workspaceId={workspaceId} onCancel={mocks.onCancel} />);

    await user.click(screen.getByRole("button", { name: "Publish discussion" }));

    expect(await screen.findByText(/Please add a clear title/)).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Title" }).getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByRole("textbox", { name: "Context" }).getAttribute("aria-invalid")).toBe("true");
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
  });

  it("publishes once, resets the draft, and links to the real discussion", async () => {
    const user = userEvent.setup();
    mocks.mutateAsync.mockResolvedValue({ id: "c000000000000000000000002", title: "Improve onboarding" });
    render(<CreateDiscussionForm workspaceId={workspaceId} onCancel={mocks.onCancel} />);

    await user.type(screen.getByRole("textbox", { name: "Title" }), "Improve onboarding");
    await user.type(screen.getByRole("textbox", { name: "Context" }), "Where do new contributors lose the thread?");
    await user.click(screen.getByRole("button", { name: "Publish discussion" }));

    await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("status")).toHaveProperty("textContent", expect.stringContaining("Discussion published"));
    expect(screen.getByRole("link", { name: "Open Improve onboarding" }).getAttribute("href"))
      .toBe(`/workspace/${workspaceId}/discussions/c000000000000000000000002`);
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveProperty("value", "");
  });

  it("retains the draft when publishing fails", async () => {
    const user = userEvent.setup();
    mocks.mutateAsync.mockImplementation(async () => {
      mocks.error = new Error("Connection unavailable");
      throw mocks.error;
    });
    render(<CreateDiscussionForm workspaceId={workspaceId} onCancel={mocks.onCancel} />);

    await user.type(screen.getByRole("textbox", { name: "Title" }), "Improve onboarding");
    await user.type(screen.getByRole("textbox", { name: "Context" }), "Add a clear first step for contributors.");
    await user.click(screen.getByRole("button", { name: "Publish discussion" }));

    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Connection unavailable");
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveProperty("value", "Improve onboarding");
  });

  it("prevents duplicate submission while a publish request is in flight", async () => {
    let resolvePublish!: (value: { id: string; title: string }) => void;
    mocks.mutateAsync.mockReturnValue(new Promise((resolve) => { resolvePublish = resolve; }));
    render(<CreateDiscussionForm workspaceId={workspaceId} onCancel={mocks.onCancel} />);

    fireEvent.change(screen.getByRole("textbox", { name: "Title" }), { target: { value: "Improve onboarding" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Context" }), { target: { value: "Document the first step." } });
    const form = screen.getByRole("button", { name: "Publish discussion" }).closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledTimes(1));

    resolvePublish({ id: "c000000000000000000000002", title: "Improve onboarding" });
    expect(await screen.findByRole("status")).toBeTruthy();
  });
});
