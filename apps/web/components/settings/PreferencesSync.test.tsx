import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  data: undefined as Record<string, unknown> | undefined,
  update: vi.fn(),
  visit: vi.fn(),
}));

vi.mock("@/lib/trpc/api-client", () => ({
  trpc: {
    preferences: {
      get: { useQuery: () => ({ data: mocks.data }) },
      update: { useMutation: () => ({ mutate: mocks.update }) },
      visit: { useMutation: () => ({ mutate: mocks.visit }) },
    },
  },
}));

import { PreferencesSync } from "./PreferencesSync";

const saved = { saved: true, theme: "dark", motion: "reduce", density: "compact", startPage: "home", defaultWorkspaceId: null, lastWorkspaceId: null };

describe("PreferencesSync", () => {
  beforeEach(() => { localStorage.clear(); mocks.update.mockReset(); mocks.visit.mockReset(); });
  afterEach(() => { cleanup(); delete document.documentElement.dataset.motion; delete document.documentElement.dataset.density; });

  it("adopts the account's saved appearance on this device", () => {
    mocks.data = saved;
    render(<PreferencesSync />);
    expect(localStorage.getItem("commons-theme")).toBe("dark");
    expect(localStorage.getItem("commons-motion")).toBe("reduce");
    expect(document.documentElement.dataset.motion).toBe("reduce");
    expect(document.documentElement.dataset.density).toBe("compact");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("uploads this browser's choices when the account has none yet", () => {
    localStorage.setItem("commons-theme", "light");
    localStorage.setItem("commons-density", "compact");
    mocks.data = { ...saved, saved: false, theme: "system", motion: "system", density: "comfortable" };
    render(<PreferencesSync />);
    expect(mocks.update).toHaveBeenCalledWith({ theme: "light", motion: undefined, density: "compact" });
  });

  it("uploads nothing when this browser has only defaults", () => {
    mocks.data = { ...saved, saved: false, theme: "system", motion: "system", density: "comfortable" };
    render(<PreferencesSync />);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("remembers the workspace only when Commons opens on the last one", () => {
    mocks.data = { ...saved, startPage: "home" };
    const { rerender } = render(<PreferencesSync workspaceId="w1" />);
    expect(mocks.visit).not.toHaveBeenCalled();
    mocks.data = { ...saved, startPage: "last", lastWorkspaceId: "w1" };
    rerender(<PreferencesSync workspaceId="w1" />);
    expect(mocks.visit).not.toHaveBeenCalled();
    rerender(<PreferencesSync workspaceId="w2" />);
    expect(mocks.visit).toHaveBeenCalledWith({ workspaceId: "w2" });
  });
});
