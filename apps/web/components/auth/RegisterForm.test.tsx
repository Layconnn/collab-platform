import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  mutateAsync: vi.fn(),
  isPending: false,
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    register: {
      mutateAsync: mocks.mutateAsync,
      isPending: mocks.isPending,
    },
  }),
}));

import { RegisterForm } from "@/components/auth/RegisterForm";

describe("RegisterForm", () => {
  beforeEach(() => {
    mocks.replace.mockReset();
    mocks.mutateAsync.mockReset().mockResolvedValue({});
    mocks.isPending = false;
  });

  afterEach(cleanup);

  it("validates and submits registration, then opens the workspace dashboard", async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);

    await user.type(screen.getByLabelText("Email"), "  Person@Example.com  ");
    await user.type(screen.getByLabelText("Username"), "NewPerson");
    await user.type(screen.getByLabelText("Password"), "correct-horse-42");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(mocks.mutateAsync).toHaveBeenCalledWith({
      email: "Person@Example.com",
      username: "newperson",
      password: "correct-horse-42",
    });
    expect(mocks.replace).toHaveBeenCalledWith("/workspace");
  });

  it("does not submit invalid credentials", async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);

    await user.type(screen.getByLabelText("Email"), "not-an-email");
    await user.type(screen.getByLabelText("Username"), "x");
    await user.type(screen.getByLabelText("Password"), "short");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(mocks.mutateAsync).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Username").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByLabelText("Username").getAttribute("aria-describedby")).toContain("register-username-error");
    expect(document.getElementById("register-username-error")?.textContent).toBeTruthy();
  });

  it("shows a safe conflict error and focuses it", async () => {
    mocks.mutateAsync.mockRejectedValue({ data: { code: "CONFLICT" }, message: "internal detail" });
    const user = userEvent.setup();
    render(<RegisterForm />);

    await user.type(screen.getByLabelText("Email"), "person@example.com");
    await user.type(screen.getByLabelText("Username"), "person");
    await user.type(screen.getByLabelText("Password"), "correct-horse-42");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("email or username is unavailable");
    expect(alert.textContent).not.toContain("internal detail");
    await waitFor(() => expect(document.activeElement).toBe(alert));
  });

  it("toggles password visibility without submitting", async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);

    await user.type(screen.getByLabelText("Password"), "correct-horse-42");
    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(screen.getByLabelText("Password").getAttribute("type")).toBe("text");
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
  });
});
