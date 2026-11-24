import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ ids: { discussionIds: [] as string[], commentIds: [] as string[], decisionIds: [] as string[] } as unknown, mutate: vi.fn() }));
vi.mock("@/hooks/useSaved", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useSavedIds: () => ({ data: mocks.ids }),
  useSetSaved: () => ({ mutate: mocks.mutate, isPending: false }),
}));

import { SaveButton } from "./SaveButton";

describe("SaveButton", () => {
  beforeEach(() => { mocks.ids = { discussionIds: [], commentIds: ["c1"], decisionIds: [] }; mocks.mutate.mockReset(); });
  afterEach(() => cleanup());

  it("saves something not yet saved", () => {
    render(<SaveButton workspaceId="w" target={{ discussionId: "d1" }} label="discussion" />);
    const button = screen.getByRole("button", { name: "Save discussion for later" });
    expect(button.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(button);
    expect(mocks.mutate).toHaveBeenCalledWith({ workspaceId: "w", discussionId: "d1", saved: true });
  });

  it("shows a saved reply and removes it", () => {
    render(<SaveButton workspaceId="w" target={{ commentId: "c1" }} label="reply" compact />);
    const button = screen.getByRole("button", { name: "Saved reply, remove from Saved" });
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.textContent).toBe("Saved");
    fireEvent.click(button);
    expect(mocks.mutate).toHaveBeenCalledWith({ workspaceId: "w", commentId: "c1", saved: false });
  });

  it("renders nothing until it knows what is saved", () => {
    mocks.ids = undefined;
    const { container } = render(<SaveButton workspaceId="w" target={{ decisionId: "x" }} label="decision" />);
    expect(container.innerHTML).toBe("");
  });
});
