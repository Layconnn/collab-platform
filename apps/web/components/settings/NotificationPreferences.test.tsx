import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  preferences: {} as Record<string, unknown>,
  save: vi.fn(),
  setLevel: vi.fn(),
}));

vi.mock("@/lib/trpc/api-client", () => ({
  trpc: {
    useUtils: () => ({ preferences: { get: { setData: vi.fn() }, notificationLevels: { invalidate: vi.fn() } } }),
    preferences: {
      get: { useQuery: () => ({ data: mocks.preferences, error: null }) },
      update: { useMutation: () => ({ mutate: mocks.save, isPending: false, error: null, variables: undefined }) },
      notificationLevels: { useQuery: () => ({ data: [{ workspaceId: "w1", name: "Hiring", level: "INVOLVED" }, { workspaceId: "w2", name: "Platform", level: "ALL" }] }) },
      setNotificationLevel: { useMutation: () => ({ mutate: mocks.setLevel, isPending: false, error: null, variables: undefined }) },
    },
  },
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/settings/notifications" }));

import { DigestTimeSettings, NotificationKindsSettings, WorkspaceLevelsSettings } from "./NotificationPreferences";

describe("Notification preferences", () => {
  beforeEach(() => {
    mocks.save.mockReset(); mocks.setLevel.mockReset();
    mocks.preferences = { saved: true, mutedKinds: ["DISCUSSION_CREATED"], digestHour: 8, timeZone: "UTC" };
  });
  afterEach(cleanup);

  it("turns kinds on and off, and warns when mentions or reviews are off", () => {
    const { rerender } = render(<NotificationKindsSettings />);
    expect((screen.getByRole("switch", { name: "New discussions" }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole("switch", { name: "Mentions" }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole("switch", { name: "New discussions" }));
    expect(mocks.save).toHaveBeenCalledWith({ mutedKinds: [] });
    fireEvent.click(screen.getByRole("switch", { name: "Replies" }));
    expect(mocks.save).toHaveBeenLastCalledWith({ mutedKinds: ["DISCUSSION_CREATED", "COMMENT_CREATED"] });
    expect(screen.queryByRole("status")).toBeNull();

    mocks.preferences = { ...mocks.preferences, mutedKinds: ["MENTION", "REVIEW_REQUESTED"] };
    rerender(<NotificationKindsSettings />);
    expect(screen.getByRole("status").textContent).toContain("Mentions and Review requests are off.");
  });

  it("sets how much each workspace may notify you", () => {
    render(<WorkspaceLevelsSettings />);
    const hiring = screen.getByLabelText("Hiring") as HTMLSelectElement;
    expect(hiring.value).toBe("INVOLVED");
    fireEvent.change(screen.getByLabelText("Platform"), { target: { value: "NONE" } });
    expect(mocks.setLevel).toHaveBeenCalledWith({ workspaceId: "w2", level: "NONE" });
    expect(screen.getByText(/also left out of your daily digest/)).toBeTruthy();
  });

  it("chooses the digest hour and time zone, offering this device's zone", () => {
    render(<DigestTimeSettings />);
    expect((screen.getByLabelText("Time") as HTMLSelectElement).value).toBe("8");
    fireEvent.change(screen.getByLabelText("Time"), { target: { value: "7" } });
    expect(mocks.save).toHaveBeenCalledWith({ digestHour: 7 });
    fireEvent.change(screen.getByLabelText("Time zone"), { target: { value: "UTC" } });
    expect(mocks.save).toHaveBeenLastCalledWith({ timeZone: "UTC" });
    expect(screen.getByText("Arrives around 08:00 UTC, on days with something to say.")).toBeTruthy();
    const device = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (device !== "UTC") {
      fireEvent.click(screen.getByRole("button", { name: /Use this device/ }));
      expect(mocks.save).toHaveBeenLastCalledWith({ timeZone: device });
    }
  });
});
