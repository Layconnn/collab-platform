import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react";

const brandScale = Object.fromEntries(
  [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((step) => [
    step,
    { value: `var(--brand-${step})` },
  ]),
);

export const uiSystem = createSystem(
  defaultConfig,
  defineConfig({
    preflight: false,
    theme: {
      tokens: { colors: { brand: brandScale } },
      semanticTokens: {
        colors: {
          brand: {
            contrast: { value: "var(--on-brand-action)" },
            fg: { value: "var(--brand-link)" },
            subtle: { value: "var(--brand-100)" },
            muted: { value: "var(--brand-200)" },
            emphasized: { value: "var(--brand-300)" },
            solid: { value: "var(--brand-action)" },
            focusRing: { value: "var(--focus-ring)" },
          },
          canvas: { value: "var(--canvas)" },
          surface: { value: "var(--surface)" },
          surfaceSubtle: { value: "var(--surface-subtle)" },
          surfaceHover: { value: "var(--surface-hover)" },
          surfaceActive: { value: "var(--surface-active)" },
          textPrimary: { value: "var(--text-primary)" },
          textSecondary: { value: "var(--text-secondary)" },
          textMuted: { value: "var(--text-muted)" },
          border: { value: "var(--border)" },
          borderSubtle: { value: "var(--border-subtle)" },
          danger: { value: "var(--danger)" },
          dangerAction: { value: "var(--danger-action)" },
          onDangerAction: { value: "var(--on-danger-action)" },
          warning: { value: "var(--warning)" },
          success: { value: "var(--success)" },
          info: { value: "var(--info)" },
          focusRing: { value: "var(--focus-ring)" },
          editorialForest: { value: "var(--editorial-forest)" },
          editorialCream: { value: "var(--editorial-cream)" },
          editorialPaper: { value: "var(--editorial-paper)" },
          editorialCoralText: { value: "var(--editorial-coral-text)" },
        },
      },
    },
  }),
);
