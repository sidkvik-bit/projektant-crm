import { defineConfig } from "vitest/config";
import path from "node:path";

// Unit tests for pure business-rule logic (src/**/*.test.ts) — separate from the
// Playwright E2E suite (e2e/tests/*.spec.ts, see playwright.config.ts), which covers
// the same rules end to end through the real UI and database.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
