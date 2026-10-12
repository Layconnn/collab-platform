import { ChakraProvider } from "@chakra-ui/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import AuthPagesLayout from "@/app/(auth)/layout";
import { PublicThemeControl } from "@/components/theme/PublicThemeControl";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { uiSystem } from "@/lib/ui-system";

function renderControl(children = <PublicThemeControl />) {
  return render(<ChakraProvider value={uiSystem}><ThemeProvider>{children}</ThemeProvider></ChakraProvider>);
}

describe("public appearance control", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    vi.stubGlobal("CSS", { escape: (value: string) => value });
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("lets visitors choose a persistent mode and dismiss the popover with Escape", async () => {
    const user = userEvent.setup();
    renderControl();
    await user.click(screen.getByRole("button", { name: "Appearance: System" }));
    await user.click(await screen.findByRole("radio", { name: "Dark" }));
    expect(localStorage.getItem("commons-theme")).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    const trigger = screen.getByRole("button", { name: "Appearance: Dark" });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(trigger.getAttribute("aria-expanded")).not.toBe("true"));
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("is present on the authentication route group", () => {
    renderControl(<AuthPagesLayout><p>Authentication form</p></AuthPagesLayout>);
    expect(screen.getByText("Authentication form")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Appearance: System" })).toBeTruthy();
  });
});
