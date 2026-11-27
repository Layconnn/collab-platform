import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  leave: vi.fn(),
  reset: vi.fn(),
  error: null as null | { data: { code: string } },
}));

vi.mock("@/hooks/useWorkspace", () => ({
  useWorkspaceSwitcherList: () => ({ isLoading: false, data: { pages: [{ items: [
    { workspaceId: "w1", name: "Platform", role: "OWNER" },
    { workspaceId: "w2", name: "Marketing", role: "MEMBER" },
    { workspaceId: "w3", name: "Design Guild", role: "ADMIN" },
  ] }] } }),
}));
vi.mock("@/lib/trpc/api-client", () => ({
  trpc: {
    useUtils: () => ({ workspace: { listForUser: { invalidate: vi.fn() } }, preferences: { get: { invalidate: vi.fn() }, notificationLevels: { invalidate: vi.fn() } } }),
    preferences: { notificationLevels: { useQuery: () => ({ data: [{ workspaceId: "w2", name: "Marketing", level: "INVOLVED" }, { workspaceId: "w3", name: "Design Guild", level: "NONE" }] }) } },
    workspace: { leave: { useMutation: () => ({ mutate: mocks.leave, reset: mocks.reset, isPending: false, error: mocks.error }) } },
  },
}));

import { YourWorkspaces } from "./YourWorkspaces";

describe("Your workspaces", () => {
  beforeEach(() => { mocks.leave.mockReset(); mocks.error = null; });
  afterEach(cleanup);

  it("lists each workspace with its role and notification level", () => {
    render(<YourWorkspaces titleId="t" />);
    const rows = within(screen.getByRole("list", { name: "Your workspaces" })).getAllByRole("listitem");
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("PlatformOwnerNotifications: Everything"),
      expect.stringContaining("MarketingMemberNotifications: Only what involves me"),
      expect.stringContaining("Design GuildAdminNotifications: Nothing"),
    ]);
  });

  it("tells an owner to transfer ownership first", () => {
    render(<YourWorkspaces titleId="t" />);
    const leave = screen.getByRole("button", { name: "Leave Platform" });
    expect(leave.hasAttribute("disabled")).toBe(true);
    expect(leave.getAttribute("aria-describedby")).toBe("owner-w1");
    expect(screen.getByRole("link", { name: "transfer ownership" }).getAttribute("href")).toBe("/workspace/w1/members");
  });

  it("asks before leaving, then says it's done", () => {
    render(<YourWorkspaces titleId="t" />);
    fireEvent.click(screen.getByRole("button", { name: "Leave Marketing" }));
    const confirm = screen.getByRole("group", { name: "Confirm leaving Marketing" });
    expect(confirm.textContent).toContain("You’ll lose access to its discussions and decisions");
    fireEvent.click(within(confirm).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("group", { name: "Confirm leaving Marketing" })).toBeNull();
    expect(mocks.leave).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Leave Marketing" }));
    fireEvent.click(screen.getByRole("button", { name: "Leave workspace" }));
    expect(mocks.leave).toHaveBeenCalledWith({ workspaceId: "w2" }, expect.any(Object));
    act(() => { void mocks.leave.mock.calls[0]![1].onSuccess(); });
    expect(screen.getByRole("status").textContent).toBe("You left Marketing.");
  });

  it("explains a refusal", () => {
    mocks.error = { data: { code: "CONFLICT" } };
    render(<YourWorkspaces titleId="t" />);
    expect(screen.getByRole("alert").textContent).toBe("Transfer ownership before leaving this workspace.");
  });
});
