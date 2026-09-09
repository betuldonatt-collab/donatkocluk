import { defineConfig } from "vitest/config";
import path from "node:path";

// Scoped to lib/ pure functions for now -- the first regression net for
// this codebase (see the Platform Hardening Audit's P2 items). No jsdom
// environment configured since nothing tested here touches the DOM or
// React; add one only when component tests actually need it.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
    },
  },
  test: {
    include: ["lib/**/*.test.ts"],
  },
});
