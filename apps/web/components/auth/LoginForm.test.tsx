import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  mutateAsync: vi.fn(),
  isPending: false,
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ login: { mutateAsync: mocks.mutateAsync, isPending: mocks.isPending } }),
}));

import { LoginForm } from "@/components/auth/LoginForm";

describe("LoginForm", () => {
  beforeEach(() => {
    mocks.replace.mockReset();
    mocks.mutateAsync.mockReset().mockResolvedValue({});
    mocks.isPending = false;
  });
  afterEach(cleanup);

  it("validates fields and opens the workspace after successful sign in", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText("Email"), "person@example.com");
    await user.type(screen.getByLabelText("Password"), "correct-horse-42");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledWith({ email: "person@example.com", password: "correct-horse-42" }));
    expect(mocks.replace).toHaveBeenCalledWith("/workspace");
    expect(screen.getByRole("button", { name: "Opening workspace..." }).hasAttribute("disabled")).toBe(true);
  });

  it("keeps invalid credentials neutral and allows another attempt", async () => {
    mocks.mutateAsync.mockRejectedValueOnce({ data: { code: "UNAUTHORIZED" }, message: "sensitive detail" });
    const user = userEvent.setup();
    render(<LoginForm />);
    await user.type(screen.getByLabelText("Email"), "person@example.com");
    await user.type(screen.getByLabelText("Password"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Email or password is incorrect.");
    expect(alert.textContent).not.toContain("sensitive detail");
    await waitFor(() => expect(document.activeElement).toBe(alert));
    expect(screen.getByRole("button", { name: "Sign in" }).hasAttribute("disabled")).toBe(false);
  });

  it("toggles the password without submitting", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);
    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(screen.getByLabelText("Password").getAttribute("type")).toBe("text");
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
  });

  it("does not send duplicate requests while sign in is pending", async () => {
    let finishLogin!: (value: object) => void;
    mocks.mutateAsync.mockImplementation(() => new Promise((resolve) => { finishLogin = resolve; }));
    const user = userEvent.setup();
    render(<LoginForm />);
    await user.type(screen.getByLabelText("Email"), "person@example.com");
    await user.type(screen.getByLabelText("Password"), "correct-horse-42");

    const form = screen.getByRole("button", { name: "Sign in" }).closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledTimes(1));
    finishLogin({});
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/workspace"));
  });
});
