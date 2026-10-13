import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "styles/globals.css"),
  "utf8",
);
const sheet = document.createElement("style");
sheet.textContent = source.slice(0, source.indexOf("\nhtml {"));
document.head.append(sheet);

const rules = Array.from(sheet.sheet?.cssRules ?? []) as CSSStyleRule[];
const light = rules.find((rule) => rule.selectorText === ":root")?.style;
const dark = rules.find(
  (rule) => rule.selectorText === '[data-theme="dark"]',
)?.style;

function token(name: string, mode: "light" | "dark"): string {
  const value =
    (mode === "dark" ? dark?.getPropertyValue(name) : "") ||
    light?.getPropertyValue(name);
  if (!value) throw new Error(`Missing ${name} token in ${mode} theme`);
  const trimmed = value.trim();
  return trimmed.startsWith("var(")
    ? token(trimmed.slice(4, -1), mode)
    : trimmed;
}

function luminance(hex: string): number {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)
    ?.map((part) => parseInt(part, 16) / 255);
  if (!channels || channels.length !== 3)
    throw new Error(`Expected an opaque hex color, got ${hex}`);
  const [red, green, blue] = channels.map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(foreground: string, background: string): number {
  const values = [luminance(foreground), luminance(background)].sort(
    (a, b) => b - a,
  );
  return (values[0] + 0.05) / (values[1] + 0.05);
}

describe("Commons brand tokens", () => {
  it("uses canonical forest in both themes and accessible semantic action variants", () => {
    expect(token("--brand-primary", "light")).toBe("#192d20");
    expect(token("--brand-primary", "dark")).toBe("#192d20");
    expect(token("--brand-action", "light")).toBe("#192d20");
    expect(token("--brand-action", "dark")).not.toBe("#192d20");

    for (const mode of ["light", "dark"] as const) {
      for (const state of [
        "--brand-action",
        "--brand-action-hover",
        "--brand-action-active",
      ]) {
        expect(
          contrast(token("--on-brand-action", mode), token(state, mode)),
        ).toBeGreaterThanOrEqual(4.5);
      }
      expect(
        contrast(
          token("--on-brand-accent", mode),
          token("--brand-accent", mode),
        ),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(token("--brand-link", mode), token("--surface", mode)),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(token("--brand-link", mode), token("--surface-active", mode)),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(token("--text-muted", mode), token("--surface", mode)),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(token("--focus-ring", mode), token("--surface", mode)),
      ).toBeGreaterThanOrEqual(3);
      expect(
        contrast(token("--danger", mode), token("--surface", mode)),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(token("--control-border", mode), token("--surface", mode)),
      ).toBeGreaterThanOrEqual(3);
    }

    expect(
      contrast(
        token("--editorial-cream", "light"),
        token("--editorial-forest", "light"),
      ),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast(
        token("--editorial-coral-on-dark", "light"),
        token("--editorial-forest", "light"),
      ),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast(
        token("--editorial-coral-text", "light"),
        token("--editorial-paper", "light"),
      ),
    ).toBeGreaterThanOrEqual(4.5);
  });
});
