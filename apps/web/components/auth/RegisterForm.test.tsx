import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  mutateAsync: vi.fn(),
  isPending: false,
  error: null as null | { message: string },
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    register: {
      mutateAsync: mocks.mutateAsync,
      isPending: mocks.isPending,
      error: mocks.error,
    },
  }),
}));

import { RegisterForm } from "@/components/auth/RegisterForm";

describe("RegisterForm", () => {
  beforeEach(() => {
    mocks.replace.mockReset();
    mocks.mutateAsync.mockReset().mockResolvedValue({});
    mocks.error = null;
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
  });

  it("shows registration errors returned by the API", () => {
    mocks.error = { message: "Email already in use." };
    render(<RegisterForm />);

    expect(screen.getByRole("alert").textContent).toContain("Email already in use.");
  });
});
