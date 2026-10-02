import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      { find: "@repo/validators/auth", replacement: fileURLToPath(new URL("../../packages/validators/src/auth.ts", import.meta.url)) },
      { find: "@repo/validators", replacement: fileURLToPath(new URL("../../packages/validators/src/index.ts", import.meta.url)) },
      { find: "@", replacement: fileURLToPath(new URL(".", import.meta.url)) },
    ],
  },
  test: {
    environment: "jsdom",
    include: ["components/**/*.test.tsx"],
    restoreMocks: true,
  },
});
