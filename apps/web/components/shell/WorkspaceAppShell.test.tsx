import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  closeMobileNav: vi.fn(),
  sidebarOpen: true,
  mobileNavOpen: true,
  workspaceDenied: false,
}));

vi.mock("@chakra-ui/react", async () => {
  const { forwardRef } = await import("react");
  return {
    IconButton: forwardRef<HTMLButtonElement, ComponentProps<"button"> & { size?: string; variant?: string }>(
      function IconButton(props, ref) {
        const buttonProps = { ...props };
        delete buttonProps.size;
        delete buttonProps.variant;
        return <button ref={ref} {...buttonProps} />;
      },
    ),
  };
});
vi.mock("next/navigation", () => ({ usePathname: () => "/workspace/workspace-1" }));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "user-1", name: "Maya Chen", username: "maya", email: "maya@example.com" } }),
}));
vi.mock("@/hooks/useWorkspace", () => ({
  useWorkspaceSwitcherList: () => ({
    data: { pages: [{ items: [{ workspaceId: "workspace-1", name: "Open Atlas" }] }] },
    isLoading: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
  }),
  useWorkspaceDetail: () => ({ data: { name: "Open Atlas" }, error: mocks.workspaceDenied ? { data: { code: "FORBIDDEN" } } : null }),
}));
vi.mock("@/stores/ui.store", () => ({
  useUiStore: (select: (state: {
    isSidebarOpen: boolean;
    isMobileNavOpen: boolean;
    toggleSidebar: () => void;
    setMobileNavOpen: (open: boolean) => void;
  }) => unknown) => select({
    isSidebarOpen: mocks.sidebarOpen,
    isMobileNavOpen: mocks.mobileNavOpen,
    toggleSidebar: vi.fn(),
    setMobileNavOpen: mocks.closeMobileNav,
  }),
}));
vi.mock("@/components/common/AppIcon", () => ({ AppIcon: () => <span aria-hidden="true" /> }));
vi.mock("@/components/shell/AccountMenu", () => ({ AccountMenu: () => <div>Account</div> }));
vi.mock("@/components/shell/WorkspaceSwitcher", () => ({ WorkspaceSwitcher: ({ currentId, workspaces }: { currentId?: string; workspaces: Array<{ name: string }> }) => <div data-testid="workspace-switcher" data-current-id={currentId ?? ""}>{workspaces.map((workspace) => workspace.name).join(", ")}</div> }));
vi.mock("@/components/notification/NotificationDropdown", () => ({ NotificationDropdown: () => <div>Notifications</div> }));
vi.mock("@/components/workspace/WorkspaceNavigation", () => ({ WorkspaceNavigation: ({ workspaceId }: { workspaceId?: string }) => <nav data-workspace-id={workspaceId ?? ""}>Workspace links</nav> }));

import { WorkspaceAppShell } from "@/components/shell/WorkspaceAppShell";

describe("WorkspaceAppShell mobile navigation", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    mocks.closeMobileNav.mockReset();
    mocks.workspaceDenied = false;
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows one Commons identity before the switcher and retains keyboard close", () => {
    render(<WorkspaceAppShell><p>Workspace content</p></WorkspaceAppShell>);

    const drawer = screen.getByRole("dialog", { name: "Workspace navigation" });
    expect(within(drawer).getAllByText("Commons")).toHaveLength(1);
    expect(within(drawer).getByTestId("workspace-switcher")).toBeTruthy();
    const close = within(drawer).getByRole("button", { name: "Close navigation" });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(mocks.closeMobileNav).toHaveBeenCalledWith(false);
  });

  it("lets an expanded menu inside the drawer handle Escape first", () => {
    render(<WorkspaceAppShell><p>Workspace content</p></WorkspaceAppShell>);
    const drawer = screen.getByRole("dialog", { name: "Workspace navigation" });
    const menu = document.createElement("details");
    menu.open = true;
    drawer.append(menu);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(mocks.closeMobileNav).not.toHaveBeenCalled();
  });

  it("removes revoked workspace identity and links from cached shell navigation", () => {
    mocks.workspaceDenied = true;
    render(<WorkspaceAppShell><p>Workspace access restricted</p></WorkspaceAppShell>);

    expect(screen.getByText("Workspace unavailable")).toBeTruthy();
    expect(screen.queryByText("Open Atlas")).toBeNull();
    for (const switcher of screen.getAllByTestId("workspace-switcher")) {
      expect(switcher.getAttribute("data-current-id")).toBe("");
      expect(switcher.textContent).not.toContain("Open Atlas");
    }
    for (const nav of screen.getAllByText("Workspace links")) {
      expect(nav.getAttribute("data-workspace-id")).toBe("");
    }
  });
});
