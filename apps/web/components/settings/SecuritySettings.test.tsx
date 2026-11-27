import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  sessions: [] as Array<Record<string, unknown>>,
  log: [] as Array<Record<string, unknown>>,
  signOut: vi.fn(),
  signOutOthers: vi.fn(),
}));

vi.mock("next/navigation", () => ({ usePathname: () => "/settings/security" }));
vi.mock("@/lib/trpc/api-client", () => ({
  trpc: {
    useUtils: () => ({ security: { sessions: { invalidate: vi.fn() }, log: { invalidate: vi.fn() } } }),
    security: {
      sessions: { useQuery: () => ({ data: mocks.sessions, error: null }) },
      twoStep: { useQuery: () => ({ data: { enabled: true, enabledAt: new Date(), recoveryCodesLeft: 10 }, error: null }) },
      signOutSession: { useMutation: () => ({ mutate: mocks.signOut, isPending: false, error: null }) },
      signOutOthers: { useMutation: () => ({ mutate: mocks.signOutOthers, isPending: false, error: null }) },
      log: { useInfiniteQuery: () => ({ data: { pages: [{ items: mocks.log, nextCursor: null }] }, hasNextPage: false, error: null }) },
    },
  },
}));

import { SecurityLogSettings, SecurityOverview, SessionsSettings } from "./SecuritySettings";

const now = new Date();
const session = (id: string, device: string, country: string | null, current = false) => ({ id, device, country, current, createdAt: now, lastSeenAt: now });

describe("Security settings", () => {
  beforeEach(() => {
    mocks.signOut.mockReset(); mocks.signOutOthers.mockReset();
    mocks.sessions = [session("a", "Chrome on Windows", "NG", true), session("b", "Safari on iPhone", "GB"), session("c", "Firefox on Linux", null)];
  });
  afterEach(cleanup);

  it("sums up active sessions on the overview", () => {
    render(<SecurityOverview />);
    expect(screen.getByRole("link", { name: /Sessions/ }).textContent).toContain("3 active");
    expect(screen.getByRole("link", { name: /Password/ }).getAttribute("href")).toBe("/settings/account/password");
    expect(screen.getByRole("link", { name: /Two-step sign-in/ }).textContent).toContain("On");
  });

  it("lists sessions with this device first and signs one out", () => {
    render(<SessionsSettings />);
    const rows = within(screen.getByRole("list", { name: "Signed-in sessions" })).getAllByRole("listitem");
    expect(rows[0]!.textContent).toContain("Chrome on Windows");
    expect(rows[0]!.textContent).toContain("This device");
    expect(within(rows[0]!).queryByRole("button")).toBeNull();
    expect(rows[1]!.textContent).toContain("United Kingdom");
    fireEvent.click(screen.getByRole("button", { name: "Sign out Safari on iPhone in United Kingdom" }));
    expect(mocks.signOut).toHaveBeenCalledWith({ sessionId: "b" }, expect.any(Object));
  });

  it("asks before signing out every other session", () => {
    render(<SessionsSettings />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out all other sessions" }));
    const confirm = screen.getByRole("group", { name: "Confirm signing out other sessions" });
    expect(confirm.textContent).toContain("Sign out all 2 other sessions?");
    fireEvent.click(within(confirm).getByRole("button", { name: "Sign out" }));
    expect(mocks.signOutOthers).toHaveBeenCalled();
  });

  it("says when this is the only session", () => {
    mocks.sessions = [session("a", "Chrome on Windows", "NG", true)];
    render(<SessionsSettings />);
    expect(screen.getByText("This is the only device signed in.")).toBeTruthy();
  });

  it("shows the security log with failed attempts marked", () => {
    mocks.log = [
      { id: "e2", kind: "SIGN_IN_FAILED", device: "Chrome on Windows", country: "NG", createdAt: now, sessionId: null },
      { id: "e1", kind: "PASSWORD_CHANGED", device: null, country: null, createdAt: now, sessionId: null },
      { id: "e0", kind: "RECOVERY_CODE_USED", device: null, country: null, createdAt: now, sessionId: null },
    ];
    render(<SecurityLogSettings />);
    const events = within(screen.getByRole("list", { name: "Security events" })).getAllByRole("listitem");
    expect(events[0]!.textContent).toContain("Failed sign-in attempt");
    expect(events[0]!.textContent).toContain("Chrome on Windows · Nigeria");
    expect(events[1]!.textContent).toContain("Password changed");
    expect(events[2]!.textContent).toContain("Signed in with a recovery code");
  });
});
