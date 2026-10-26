import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // The web app's tsconfig preserves JSX for Next.js. Tests compile it with React's automatic runtime.
  esbuild: { jsx: "automatic" },
  resolve: { alias: { "@": fileURLToPath(new URL("./apps/web/src", import.meta.url)) } },
  test: {
    // Logic tests run in Node. A component or hook test opts into a DOM with `// @vitest-environment happy-dom`.
    include: ["packages/*/src/**/*.test.ts", "apps/web/src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.ts", "apps/web/src/lib/**/*.ts", "apps/web/src/hooks/**/*.ts"],
      // The CLI only writes files, and types.ts holds no runtime code.
      exclude: ["**/*.test.{ts,tsx}", "packages/synth/src/cli.ts", "packages/correlate/src/types.ts"],
      reporter: ["text-summary", "lcov"],
      thresholds: { lines: 85, branches: 75, functions: 85 },
    },
  },
});
