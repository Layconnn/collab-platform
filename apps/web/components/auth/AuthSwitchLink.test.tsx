import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));

import { AuthSwitchLink } from "./AuthSwitchLink";

describe("AuthSwitchLink", () => {
  afterEach(() => { cleanup(); mocks.push.mockReset(); window.history.replaceState(null, "", "/"); });

  it("keeps a same-site next when switching between sign-in and registration", () => {
    window.history.replaceState(null, "", "/login?next=%2Fjoin%2Fabc");
    render(<AuthSwitchLink href="/register">Create an account</AuthSwitchLink>);
    fireEvent.click(screen.getByRole("link", { name: "Create an account" }));
    expect(mocks.push).toHaveBeenCalledWith("/register?next=%2Fjoin%2Fabc");
  });

  it("drops an unsafe next", () => {
    window.history.replaceState(null, "", "/login?next=%2F%2Fevil.example");
    render(<AuthSwitchLink href="/register">Create an account</AuthSwitchLink>);
    const link = screen.getByRole("link", { name: "Create an account" });
    expect(link.getAttribute("href")).toBe("/register");
    link.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(link);
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
