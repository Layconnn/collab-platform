import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  user: null as null | { username: string },
  describe: { data: undefined as unknown, error: null as unknown, isLoading: false },
  join: { mutate: vi.fn(), isPending: false, isSuccess: false, error: null as unknown },
  push: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: mocks.user ?? undefined, isLoading: false }) }));
vi.mock("@/hooks/useInvites", () => ({ useInviteLink: () => ({ describe: mocks.describe, join: mocks.join }) }));

import { JoinPage } from "./JoinPage";

const invitation = (overrides: Record<string, unknown> = {}) => ({ workspace: { id: "w1", name: "Platform" }, invitedBy: "Maya Okafor", role: "MEMBER", alreadyMember: false, ...overrides });

describe("JoinPage", () => {
  beforeEach(() => {
    mocks.user = null;
    mocks.describe = { data: invitation(), error: null, isLoading: false };
    mocks.join = { mutate: vi.fn(), isPending: false, isSuccess: false, error: null };
    mocks.push.mockReset();
  });
  afterEach(() => cleanup());

  it("signed out: says who invited you and keeps the link through sign-in or registration", () => {
    render(<JoinPage token="tok_123" />);
    expect(screen.getByRole("heading", { name: "Maya Okafor invited you to join Platform" })).toBeTruthy();
    expect(screen.getByText(/You will join as a member\./)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Create account" }).getAttribute("href")).toBe("/register?next=%2Fjoin%2Ftok_123");
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/login?next=%2Fjoin%2Ftok_123");
    expect(screen.queryByRole("button", { name: /Join/ })).toBeNull();
  });

  it("signed in: joins with one click and opens the workspace", () => {
    mocks.user = { username: "lee" };
    mocks.describe.data = invitation({ role: "ADMIN" });
    mocks.join.mutate.mockImplementation((_input, options) => options.onSuccess({ workspaceId: "w1", joined: true }));
    render(<JoinPage token="tok_123" />);
    expect(screen.getByText("You will join as an admin, signed in as lee.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Join Platform" }));
    expect(mocks.join.mutate).toHaveBeenCalledWith({ token: "tok_123" }, expect.anything());
    expect(mocks.push).toHaveBeenCalledWith("/workspace/w1");
  });

  it("tells a member they are already in and links to the workspace", () => {
    mocks.user = { username: "sam" };
    mocks.describe.data = invitation({ alreadyMember: true });
    render(<JoinPage token="tok_123" />);
    expect(screen.getByRole("heading", { name: "You are already in Platform" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open Platform" }).getAttribute("href")).toBe("/workspace/w1");
  });

  it("explains a link that no longer works without naming anything", () => {
    mocks.describe = { data: undefined, error: { data: { code: "NOT_FOUND" } }, isLoading: false };
    render(<JoinPage token="tok_123" />);
    expect(screen.getByRole("heading", { name: "This invite link no longer works" })).toBeTruthy();
    expect(screen.getByText(/Ask the person who shared it for a new one/)).toBeTruthy();
  });

  it("says when the link stopped working while joining", () => {
    mocks.user = { username: "lee" };
    mocks.join.error = { data: { code: "NOT_FOUND" } };
    render(<JoinPage token="tok_123" />);
    expect(screen.getByRole("alert").textContent).toMatch(/stopped working/);
  });
});
