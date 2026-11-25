import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  items: [] as unknown[],
  create: vi.fn(),
  revoke: vi.fn(),
  createError: null as null | { message: string },
}));
vi.mock("@/hooks/useInvites", () => ({
  useInvites: () => ({
    list: { data: { items: mocks.items }, isLoading: false, error: null, isFetching: false, refetch: vi.fn() },
    create: { mutate: mocks.create, isPending: false, error: mocks.createError, reset: vi.fn() },
    revoke: { mutate: mocks.revoke, isPending: false, error: null },
  }),
}));

import { InviteLinks } from "./InviteLinks";

const DAY = 86_400_000;
const invite = (overrides: Record<string, unknown>) => ({
  id: "i1", role: "MEMBER", name: null, maxUses: null, uses: 0, expiresAt: new Date(Date.now() + 7 * DAY), createdAt: new Date(), createdBy: "Maya", status: "ACTIVE", ...overrides,
});

describe("InviteLinks", () => {
  beforeEach(() => {
    mocks.items = []; mocks.create.mockReset(); mocks.revoke.mockReset(); mocks.createError = null;
  });
  afterEach(() => cleanup());

  it("creates a link with the chosen options and shows it once with Copy", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    mocks.create.mockImplementation((_input, options) => options.onSuccess({ path: "/join/tok", invite: { role: "ADMIN", expiresAt: new Date(Date.now() + DAY) } }));
    render(<InviteLinks workspaceId="w1" />);
    fireEvent.click(screen.getByRole("button", { name: "Invite people" }));
    const dialog = screen.getByRole("dialog", { name: "Invite people" });
    fireEvent.change(within(dialog).getByLabelText("Join as"), { target: { value: "ADMIN" } });
    expect(within(dialog).getByText(/can manage members/)).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText("Expires after"), { target: { value: "1" } });
    fireEvent.change(within(dialog).getByLabelText(/Use limit/), { target: { value: "5" } });
    fireEvent.change(within(dialog).getByLabelText("Name (optional)"), { target: { value: " Leads " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create link" }));
    expect(mocks.create).toHaveBeenCalledWith({ workspaceId: "w1", role: "ADMIN", expiresInDays: 1, maxUses: 5, name: "Leads" }, expect.anything());

    const result = screen.getByRole("dialog", { name: "Your invite link" });
    expect((within(result).getByLabelText("Link") as HTMLInputElement).value).toBe(`${window.location.origin}/join/tok`);
    expect(within(result).getByText("Copy it now.")).toBeTruthy();
    fireEvent.click(within(result).getByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/join/tok`);
    expect(await within(result).findByText(/Copied\. Paste it/)).toBeTruthy();
  });

  it("refuses a use limit outside 1 to 100", () => {
    render(<InviteLinks workspaceId="w1" />);
    fireEvent.click(screen.getByRole("button", { name: "Invite people" }));
    fireEvent.change(screen.getByLabelText(/Use limit/), { target: { value: "500" } });
    expect(screen.getByText("Enter a number from 1 to 100, or leave it empty.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Create link" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("lists links with uses and when they end, and revokes after confirming", () => {
    mocks.items = [
      invite({ id: "i1", name: "Design team", maxUses: 5, uses: 3 }),
      invite({ id: "i2", role: "ADMIN", uses: 2 }),
      invite({ id: "i3", status: "EXPIRED", expiresAt: new Date(Date.now() - DAY) }),
      invite({ id: "i4", status: "USED_UP", maxUses: 1, uses: 1 }),
    ];
    render(<InviteLinks workspaceId="w1" />);
    const rows = within(screen.getByRole("list", { name: "Invite links" })).getAllByRole("listitem");
    expect(rows[0]!.textContent).toContain("Design team");
    expect(rows[0]!.textContent).toContain("3 of 5 joined");
    expect(rows[1]!.textContent).toContain("Admin");
    expect(rows[1]!.textContent).toContain("2 joined");
    expect(rows[2]!.textContent).toContain("Expired");
    expect(rows[3]!.textContent).toContain("Used up");
    expect(within(rows[2]!).queryByRole("button", { name: /Revoke/ })).toBeNull();

    fireEvent.click(within(rows[0]!).getByRole("button", { name: "Revoke Design team" }));
    expect(mocks.revoke).not.toHaveBeenCalled();
    fireEvent.click(within(rows[0]!).getByRole("button", { name: "Revoke link" }));
    expect(mocks.revoke).toHaveBeenCalledWith({ workspaceId: "w1", inviteId: "i1" }, expect.anything());
  });
});
