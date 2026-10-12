import { render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Home from "@/app/page";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { uiSystem } from "@/lib/ui-system";

describe("public landing page", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("shows the product and links only to existing public routes", () => {
    const { container } = render(<ChakraProvider value={uiSystem}><ThemeProvider><Home /></ThemeProvider></ChakraProvider>);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "A workspace for conversations worth keeping.",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("img", { name: /illustrative Commons application/i }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: /explore the product/i })
        .getAttribute("href"),
    ).toBe("#product");

    const publicPaths = new Set(["/", "/login", "/register"]);
    const routeLinks = Array.from(
      container.querySelectorAll<HTMLAnchorElement>('a[href^="/"]'),
    );
    expect(routeLinks.length).toBeGreaterThan(0);
    expect(
      routeLinks.every((link) =>
        publicPaths.has(link.getAttribute("href") ?? ""),
      ),
    ).toBe(true);
    expect(
      routeLinks.some((link) => link.getAttribute("href") === "/register"),
    ).toBe(true);
    expect(screen.getByRole("button", { name: "Appearance: System" })).toBeTruthy();
  });
});
