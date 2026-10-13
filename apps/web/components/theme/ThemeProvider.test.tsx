import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { AccountMenu } from "@/components/shell/AccountMenu";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { applyTheme, normalizeThemeMode, resolveTheme, themeInitScript } from "@/lib/theme";

vi.mock("@/components/auth/SignOutButton", () => ({ SignOutButton: () => <button>Sign out</button> }));

const user = { name: "Maya Chen", username: "maya", email: "maya@example.com" };

function mockSystem(dark: boolean) {
  let matches = dark;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  vi.stubGlobal("matchMedia", vi.fn(() => ({
    get matches() { return matches; },
    addEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener),
  })));
  return { change(next: boolean) {
    matches = next;
    listeners.forEach((listener) => listener({ matches: next } as MediaQueryListEvent));
  } };
}

describe("Commons theme", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.classList.remove("dark");
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("normalizes stored modes and resolves System", () => {
    expect(normalizeThemeMode("invalid")).toBe("system");
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
  });

  it("applies the saved preference before hydration", () => {
    const media = mockSystem(true);
    localStorage.setItem("commons-theme", "light");
    new Function("document", "localStorage", "matchMedia", themeInitScript)(document, localStorage, matchMedia);
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    localStorage.setItem("commons-theme", "system");
    new Function("document", "localStorage", "matchMedia", themeInitScript)(document, localStorage, matchMedia);
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    media.change(false);
    applyTheme("system", false);
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("persists Light, Dark and System from the account menu and follows OS changes", () => {
    const media = mockSystem(false);
    render(<ThemeProvider><AccountMenu user={user} /></ThemeProvider>);
    fireEvent.click(document.querySelector("summary")!);
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(localStorage.getItem("commons-theme")).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    fireEvent.click(screen.getByRole("radio", { name: "System" }));
    expect(localStorage.getItem("commons-theme")).toBe("system");
    expect(document.documentElement.dataset.theme).toBe("light");
    media.change(true);
    expect(document.documentElement.dataset.theme).toBe("dark");
    fireEvent.click(screen.getByRole("radio", { name: "Light" }));
    expect(document.documentElement.dataset.theme).toBe("light");
    media.change(true);
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("restores a saved mode and synchronizes another tab", () => {
    mockSystem(false);
    localStorage.setItem("commons-theme", "dark");
    render(<ThemeProvider><AccountMenu user={user} /></ThemeProvider>);
    expect(document.documentElement.dataset.theme).toBe("dark");
    localStorage.setItem("commons-theme", "light");
    fireEvent(window, new StorageEvent("storage", { key: "commons-theme" }));
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
