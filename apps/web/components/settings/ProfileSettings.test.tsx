import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  user: { id: "u1", name: "Maya Okafor", username: "maya", email: "maya@example.test", usernameChangedAt: null as Date | null },
  update: vi.fn(),
  change: vi.fn(),
  checks: [] as string[],
  availability: (username: string) => username === "sam"
    ? { available: false, reason: "taken", username }
    : username.length < 3 ? { available: false, reason: "invalid", message: "Use at least 3 characters." }
      : { available: true, reason: "free", username },
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("@/lib/trpc/api-client", () => ({
  trpc: {
    useUtils: () => ({ auth: { me: { invalidate: vi.fn() } } }),
    profile: {
      update: { useMutation: () => ({ mutate: mocks.update, reset: vi.fn(), isPending: false, isSuccess: false, error: null }) },
      changeUsername: { useMutation: () => ({ mutate: mocks.change, reset: vi.fn(), isPending: false, isSuccess: false, error: null, data: undefined }) },
      usernameAvailable: {
        useQuery: ({ username }: { username: string }, { enabled }: { enabled: boolean }) => {
          if (enabled) mocks.checks.push(username);
          return { data: enabled ? mocks.availability(username) : undefined, isFetching: false };
        },
      },
    },
  },
}));

import { ProfileSettings } from "./ProfileSettings";

describe("ProfileSettings", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.update.mockReset(); mocks.change.mockReset(); mocks.checks = [];
    mocks.user = { ...mocks.user, usernameChangedAt: null };
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  const type = (label: string, value: string) => {
    fireEvent.change(screen.getAllByLabelText(label).find((node) => node.tagName === "INPUT")!, { target: { value } });
    act(() => { vi.advanceTimersByTime(400); });
  };

  it("saves a trimmed display name, and says an empty one shows the username", () => {
    render(<ProfileSettings />);
    const save = screen.getByRole("button", { name: "Save name" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    type("Display name", "  Maya O.  ");
    fireEvent.click(save);
    expect(mocks.update).toHaveBeenCalledWith({ name: "Maya O." });
    expect(screen.getByText(/Leave it empty to show @maya/)).toBeTruthy();
    type("Display name", "x".repeat(61));
    expect(screen.getByRole("alert").textContent).toBe("Use 60 characters or fewer.");
  });

  it("checks a new username as you type and only then allows the change", () => {
    render(<ProfileSettings />);
    const change = screen.getByRole("button", { name: "Change username" }) as HTMLButtonElement;
    expect(change.disabled).toBe(true);

    type("Username", "sam");
    expect(screen.getByText("That username is taken.")).toBeTruthy();
    expect(change.disabled).toBe(true);

    type("Username", "ab");
    expect(screen.getByText("Use at least 3 characters.")).toBeTruthy();

    type("Username", "Maya_O");
    expect(screen.getByText("@maya_o is available.")).toBeTruthy();
    expect(mocks.checks.at(-1)).toBe("maya_o");
    fireEvent.click(change);
    expect(mocks.change).toHaveBeenCalledWith({ username: "maya_o" });
    expect(screen.getByText(/Mentions of @maya stay as they were written/)).toBeTruthy();
  });

  it("locks the username during the 30-day cool-down and says when it opens", () => {
    mocks.user = { ...mocks.user, usernameChangedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) };
    render(<ProfileSettings />);
    const input = screen.getAllByLabelText("Username").find((node) => node.tagName === "INPUT") as HTMLInputElement;
    expect(input.disabled).toBe(true);
    expect(screen.getByText(/You can change it again on/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Change username" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
