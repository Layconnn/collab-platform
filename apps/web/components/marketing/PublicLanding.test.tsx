import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "@/app/page";

describe("public landing page", () => {
  it("shows the product and links only to existing public routes", () => {
    const { container } = render(<Home />);

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
  });
});
