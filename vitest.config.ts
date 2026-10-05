import { defineConfig } from "vitest/config";
import path from "node:path";

// Scoped to lib/ so far: pure functions, plus a few server-rendered component checks
// (renderToStaticMarkup, no jsdom) where the markup itself is the rule being tested.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
    },
  },
  test: {
    include: ["lib/**/*.test.ts", "lib/**/*.test.tsx"],
  },
});
