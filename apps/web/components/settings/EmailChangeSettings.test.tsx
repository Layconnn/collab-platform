import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  status: { pending: null as null | { email: string; expiresAt: string }, sending: "allowlist" as "off" | "allowlist" | "all" },
  request: vi.fn(),
  confirm: vi.fn(),
  cancel: vi.fn(),
  requestError: null as null | { data: { code: string }; message: string },
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { email: "maya@example.test" } }) }));
vi.mock("@/lib/trpc/api-client", () => ({
  trpc: {
    useUtils: () => ({ auth: { me: { invalidate: vi.fn() } }, security: { emailChange: { invalidate: vi.fn() }, log: { invalidate: vi.fn() } } }),
    security: {
      emailChange: { useQuery: () => ({ data: mocks.status, error: null }) },
      requestEmailChange: { useMutation: () => ({ mutate: mocks.request, isPending: false, error: mocks.requestError }) },
      confirmEmailChange: { useMutation: () => ({ mutate: mocks.confirm, reset: vi.fn(), isPending: false, error: null }) },
      cancelEmailChange: { useMutation: () => ({ mutate: mocks.cancel, isPending: false }) },
    },
  },
}));

import { EmailChangeSettings } from "./EmailChangeSettings";

describe("Change your email", () => {
  beforeEach(() => {
    mocks.status = { pending: null, sending: "allowlist" };
    mocks.request.mockReset(); mocks.confirm.mockReset(); mocks.cancel.mockReset(); mocks.requestError = null;
  });
  afterEach(cleanup);

  it("asks for the new address and the password, and says only test addresses work for now", () => {
    render(<EmailChangeSettings />);
    expect(screen.getByText("maya@example.test")).toBeTruthy();
    expect(screen.getByText(/codes can only be sent to addresses on the test list/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("New email address"), { target: { value: "not-an-email" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "my-password-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    expect(screen.getByRole("alert").textContent).toBe("Enter a valid email address.");
    fireEvent.change(screen.getByLabelText("New email address"), { target: { value: "maya@new.example" } });
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    expect(mocks.request).toHaveBeenCalledWith({ email: "maya@new.example", password: "my-password-1" }, expect.any(Object));
  });

  it("confirms with the emailed code, or starts over", () => {
    mocks.status = { pending: { email: "maya@new.example", expiresAt: "2026-11-27T12:15:00.000Z" }, sending: "all" };
    render(<EmailChangeSettings />);
    expect(screen.getByRole("form", { name: "Confirm your new email" }).textContent).toContain("maya@new.example");
    fireEvent.change(screen.getByLabelText("Code from the email"), { target: { value: "12345" } });
    fireEvent.click(screen.getByRole("button", { name: "Change email" }));
    expect(screen.getByRole("alert").textContent).toBe("Enter the 6-digit code from the email.");
    fireEvent.change(screen.getByLabelText("Code from the email"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Change email" }));
    expect(mocks.confirm).toHaveBeenCalledWith({ code: "123456" }, expect.any(Object));
    fireEvent.click(screen.getByRole("button", { name: "Use a different address" }));
    expect(mocks.cancel).toHaveBeenCalled();
  });

  it("says when email isn't set up, and shows the server's reason", () => {
    mocks.status = { pending: null, sending: "off" };
    render(<EmailChangeSettings />);
    expect(screen.getByText(/Email isn’t set up for Commons yet/)).toBeTruthy();
    expect((screen.getByLabelText("New email address") as HTMLInputElement).disabled).toBe(true);
    cleanup();

    mocks.status = { pending: null, sending: "allowlist" };
    mocks.requestError = { data: { code: "PRECONDITION_FAILED" }, message: "That address isn't on the test list, so it can't get a code yet." };
    render(<EmailChangeSettings />);
    expect(screen.getByRole("alert").textContent).toBe("That address isn't on the test list, so it can't get a code yet.");
  });
});
