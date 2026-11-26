import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  pathname: "/settings",
  mutate: vi.fn(),
  change: { isPending: false, isSuccess: false, error: null as null | { data: { code: string } } },
  setMode: vi.fn(),
  prefs: { data: { enabled: true, workspaces: [{ id: "w1", name: "Platform", included: true }, { id: "w2", name: "Marketing", included: false }] }, error: null } as unknown,
}));

vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1", name: "Maya Okafor", username: "maya_okafor", email: "maya@example.test" } }) }));
vi.mock("@/hooks/useDigest", () => ({ useDigestPreferences: () => mocks.prefs }));
vi.mock("@/components/settings/EmailSettings", () => ({ EmailSettings: ({ embedded }: { embedded?: boolean }) => <p>Digest controls {embedded ? "embedded" : "standalone"}</p> }));
vi.mock("@/components/theme/ThemeProvider", () => ({ useTheme: () => ({ mode: "system", setMode: mocks.setMode }) }));
vi.mock("@/lib/trpc/api-client", () => ({
  trpc: { auth: { changePassword: { useMutation: () => ({ ...mocks.change, mutate: mocks.mutate }) } } },
}));

import { SettingsFrame } from "./SettingsFrame";
import { AccountSettings, AppearanceSettings, DigestSettings, NotificationSettings, PasswordSettings } from "./SettingsPages";
import { searchSettings } from "./settingsIndex";

describe("Settings", () => {
  beforeEach(() => {
    mocks.pathname = "/settings"; mocks.mutate.mockReset(); mocks.setMode.mockReset();
    mocks.change = { isPending: false, isSuccess: false, error: null };
  });
  afterEach(cleanup);

  it("lists each category with its description and marks the open one", () => {
    mocks.pathname = "/settings/account/password";
    render(<SettingsFrame><p>Detail</p></SettingsFrame>);
    const nav = screen.getByRole("navigation", { name: "Settings" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/settings/account", "/settings/notifications", "/settings/appearance"]);
    expect(links[0]!.getAttribute("aria-current")).toBe("page");
    expect(links[1]!.textContent).toContain("The daily digest email");
    expect(screen.getByText("Detail")).toBeTruthy();
  });

  it("searches setting names and says when nothing matches", () => {
    render(<SettingsFrame><p>Detail</p></SettingsFrame>);
    const search = screen.getByLabelText("Search settings");
    fireEvent.change(search, { target: { value: "dark" } });
    const results = screen.getByRole("list", { name: "Matching settings" });
    expect(within(results).getByRole("link").getAttribute("href")).toBe("/settings/appearance");
    expect(screen.getByRole("status").textContent).toBe("1 setting");
    fireEvent.change(search, { target: { value: "billing" } });
    expect(screen.getByRole("status").textContent).toBe("No setting matches “billing”");
  });

  it("matches every word across label, keywords and category", () => {
    expect(searchSettings("password").map((entry) => entry.href)).toEqual(["/settings/account/password"]);
    expect(searchSettings("email digest").map((entry) => entry.href)).toEqual(["/settings/notifications/digest"]);
    expect(searchSettings("   ")).toEqual([]);
  });

  it("shows account details and opens the password page", () => {
    render(<AccountSettings />);
    expect(screen.getByText("@maya_okafor")).toBeTruthy();
    expect(screen.getByText("maya@example.test")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Change your password/ }).getAttribute("href")).toBe("/settings/account/password");
  });

  it("checks the new password before sending it, then sends it", () => {
    render(<PasswordSettings />);
    const set = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
    set("Current password", "old-password-1");
    set("New password", "short");
    set("Confirm new password", "short");
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(screen.getByRole("alert").textContent).toBe("Use 8 to 128 characters for the new password.");
    set("New password", "new-password-2");
    set("Confirm new password", "new-password-3");
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(screen.getByRole("alert").textContent).toBe("The new passwords don't match.");
    set("Confirm new password", "new-password-2");
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(mocks.mutate).toHaveBeenCalledWith({ currentPassword: "old-password-1", newPassword: "new-password-2" }, expect.any(Object));
    expect(screen.getByRole("link", { name: /Your account/ }).getAttribute("href")).toBe("/settings/account");
  });

  it("explains a wrong current password, too many attempts and success", () => {
    mocks.change = { isPending: false, isSuccess: false, error: { data: { code: "FORBIDDEN" } } };
    const { rerender } = render(<PasswordSettings />);
    expect(screen.getByRole("alert").textContent).toBe("Your current password isn't right.");
    mocks.change = { isPending: false, isSuccess: false, error: { data: { code: "TOO_MANY_REQUESTS" } } };
    rerender(<PasswordSettings />);
    expect(screen.getByRole("alert").textContent).toBe("Too many attempts. Wait a minute and try again.");
    mocks.change = { isPending: false, isSuccess: true, error: null };
    rerender(<PasswordSettings />);
    expect(screen.getByRole("status").textContent).toBe("Password changed. Your other devices were signed out.");
  });

  it("sums up the digest and opens it, embedded", () => {
    render(<NotificationSettings />);
    const row = screen.getByRole("link", { name: /Daily digest/ });
    expect(row.textContent).toContain("On · 1 of 2 workspaces");
    expect(row.getAttribute("href")).toBe("/settings/notifications/digest");
    cleanup();
    render(<DigestSettings />);
    expect(screen.getByText("Digest controls embedded")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Notifications/ }).getAttribute("href")).toBe("/settings/notifications");
  });

  it("switches the theme from Appearance", () => {
    render(<AppearanceSettings />);
    expect((screen.getByRole("radio", { name: /System/ }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: /Dark/ }));
    expect(mocks.setMode).toHaveBeenCalledWith("dark");
  });
});
