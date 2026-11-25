import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ pathname: "/workspace/w1/decisions", setCreate: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));
vi.mock("@/stores/ui.store", () => ({ useUiStore: (select: (state: { setCreateWorkspaceOpen: (open: boolean) => void }) => unknown) => select({ setCreateWorkspaceOpen: mocks.setCreate }) }));
vi.mock("@/components/notification/NotificationDropdown", () => ({ NotificationDropdown: ({ variant }: { variant?: string }) => <button type="button">Inbox ({variant})</button> }));

import { WorkspaceNavigation } from "./WorkspaceNavigation";

const workspaces = [{ workspaceId: "w1", name: "Platform" }, { workspaceId: "w2", name: "Marketing" }];

describe("WorkspaceNavigation", () => {
  afterEach(() => { cleanup(); mocks.setCreate.mockReset(); mocks.pathname = "/workspace/w1/decisions"; });

  it("shows Home, Inbox and Saved, the workspace's pages under its name, and the member's workspaces", () => {
    render(<WorkspaceNavigation workspaceId="w1" workspaceName="Platform" workspaces={workspaces} />);
    const primary = screen.getByRole("navigation", { name: "Primary navigation" });
    expect(within(primary).getAllByRole("link").map((link) => link.textContent)).toEqual(["Home", "Saved"]);
    expect(within(primary).getByRole("button", { name: "Inbox (sidebar)" })).toBeTruthy();
    const workspace = screen.getByRole("navigation", { name: "Workspace navigation" });
    expect(within(workspace).getAllByRole("link").map((link) => link.textContent)).toEqual(["Overview", "Discussions", "Decisions", "Members"]);
    expect(within(workspace).getByRole("link", { name: "Decisions" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getAllByText("Platform").length).toBeGreaterThanOrEqual(2);
    const mine = screen.getByRole("navigation", { name: "Your workspaces" });
    expect(within(mine).getByRole("link", { name: /Marketing/ }).getAttribute("href")).toBe("/workspace/w2");
    fireEvent.click(within(mine).getByRole("button", { name: "Create workspace" }));
    expect(mocks.setCreate).toHaveBeenCalledWith(true);
  });

  it("collapsed: icons with names for screen readers, no workspace list", () => {
    mocks.pathname = "/workspace";
    render(<WorkspaceNavigation workspaceId="w1" workspaceName="Platform" workspaces={workspaces} collapsed />);
    expect(screen.getByRole("link", { name: "Home" }).getAttribute("aria-current")).toBe("page");
    expect(screen.queryByRole("navigation", { name: "Your workspaces" })).toBeNull();
    expect(screen.getByRole("button", { name: "Create a workspace" })).toBeTruthy();
  });
});
