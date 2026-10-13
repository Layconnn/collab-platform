import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  logout: vi.fn(),
  pending: false,
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ logout: { mutateAsync: mocks.logout, isPending: mocks.pending } }),
}));

import { SignOutButton } from "@/components/auth/SignOutButton";

describe("SignOutButton", () => {
  beforeEach(() => {
    mocks.replace.mockReset();
    mocks.logout.mockReset();
    mocks.pending = false;
  });

  afterEach(cleanup);

  it("redirects only after a successful sign-out", async () => {
    mocks.logout.mockResolvedValue({});
    render(<SignOutButton />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/login"));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps the user in place and offers a retry after a failed sign-out", async () => {
    mocks.logout.mockRejectedValueOnce(new Error("private server detail")).mockResolvedValueOnce({});
    render(<SignOutButton />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Could not sign out. Please try again.");
    expect(screen.queryByText("private server detail")).toBeNull();
    expect(mocks.replace).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/login"));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(mocks.logout).toHaveBeenCalledTimes(2);
  });

  it("ignores a second click while sign-out is in flight", () => {
    mocks.logout.mockReturnValue(new Promise(() => {}));
    render(<SignOutButton />);
    const button = screen.getByRole("button", { name: "Sign out" });

    fireEvent.click(button);
    fireEvent.click(button);

    expect(mocks.logout).toHaveBeenCalledTimes(1);
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
