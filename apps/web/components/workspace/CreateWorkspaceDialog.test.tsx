import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ pathname: "/workspace" }));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));
vi.mock("@/components/workspace/CreateWorkspaceForm", () => ({
  CreateWorkspaceForm: () => <form><label htmlFor="new-workspace-name">Workspace name</label><input id="new-workspace-name" /><button type="submit">Create workspace</button></form>,
}));

import { CreateWorkspaceDialog } from "./CreateWorkspaceDialog";
import { useUiStore } from "@/stores/ui.store";

const open = () => act(() => useUiStore.getState().setCreateWorkspaceOpen(true));

describe("CreateWorkspaceDialog", () => {
  beforeEach(() => { mocks.pathname = "/workspace"; useUiStore.setState({ isCreateWorkspaceOpen: false }); });
  afterEach(() => { cleanup(); window.history.replaceState(null, "", "/"); });

  it("opens over the page, focuses the name and returns focus when closed with Escape", () => {
    render(<><button type="button">Opener</button><CreateWorkspaceDialog /></>);
    expect(screen.queryByRole("dialog")).toBeNull();
    screen.getByRole("button", { name: "Opener" }).focus();
    open();
    const dialog = screen.getByRole("dialog", { name: "Create a workspace" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(screen.getByLabelText("Workspace name"));
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(useUiStore.getState().isCreateWorkspaceOpen).toBe(false);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Opener" }));
  });

  it("keeps Tab inside the dialog", () => {
    render(<CreateWorkspaceDialog />);
    open();
    const dialog = screen.getByRole("dialog");
    const close = screen.getByRole("button", { name: "Close" });
    const submit = screen.getByRole("button", { name: "Create workspace" });
    submit.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(submit);
  });

  it("closes from the close button and the backdrop", () => {
    const { container } = render(<CreateWorkspaceDialog />);
    open();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    open();
    fireEvent.mouseDown(container.querySelector(".fixed")!);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens from an old /workspace#new-workspace link and removes the anchor", () => {
    window.history.replaceState(null, "", "/workspace#new-workspace");
    render(<CreateWorkspaceDialog />);
    expect(screen.getByRole("dialog", { name: "Create a workspace" })).toBeTruthy();
    expect(window.location.hash).toBe("");
  });

  it("closes once creating the workspace has navigated to it", () => {
    const view = render(<CreateWorkspaceDialog />);
    open();
    mocks.pathname = "/workspace/c000000000000000000000001";
    view.rerender(<CreateWorkspaceDialog />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
