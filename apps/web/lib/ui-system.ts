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
    theme: {
      tokens: { colors: { brand: brandScale } },
      semanticTokens: {
        colors: {
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
          warning: { value: "var(--warning)" },
          success: { value: "var(--success)" },
          info: { value: "var(--info)" },
          focusRing: { value: "var(--focus-ring)" },
        },
      },
    },
  }),
);
