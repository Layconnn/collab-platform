import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  auth: { me: { isLoading: true, isError: false, error: null as null | { message: string; data?: { code?: string } }, data: undefined as unknown } },
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => mocks.auth }));

import { AuthGuard } from "@/components/auth/AuthGuard";

describe("AuthGuard", () => {
  afterEach(() => {
    cleanup();
    mocks.replace.mockReset();
  });

  it("does not render protected content while checking the session", () => {
    mocks.auth.me = { isLoading: true, isError: false, error: null, data: undefined };
    render(<AuthGuard><p>Protected content</p></AuthGuard>);

    expect(screen.getByText("Checking your session...")).toBeTruthy();
    expect(screen.queryByText("Protected content")).toBeNull();
  });

  it("redirects unauthenticated users to sign in", async () => {
    mocks.auth.me = {
      isLoading: false,
      isError: true,
      error: { message: "Authentication required", data: { code: "UNAUTHORIZED" } },
      data: undefined,
    };
    render(<AuthGuard><p>Protected content</p></AuthGuard>);

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/login"));
  });

  it("shows a service error without redirecting when session lookup is unavailable", () => {
    mocks.auth.me = {
      isLoading: false,
      isError: true,
      error: { message: "Database unavailable", data: { code: "INTERNAL_SERVER_ERROR" } },
      data: undefined,
    };
    render(<AuthGuard><p>Protected content</p></AuthGuard>);

    expect(screen.getByText("Could not verify your session")).toBeTruthy();
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
