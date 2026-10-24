import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", "apps/web/src/lib/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.ts", "apps/web/src/lib/**/*.ts"],
      // The CLI only writes files, and types.ts holds no runtime code.
      exclude: ["**/*.test.ts", "packages/synth/src/cli.ts", "packages/correlate/src/types.ts"],
      reporter: ["text-summary", "lcov"],
      thresholds: { lines: 85, branches: 75, functions: 85 },
    },
  },
});
