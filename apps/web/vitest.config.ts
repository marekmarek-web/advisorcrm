import path from "node:path";
import { defineConfig } from "vitest/config";

/** Mirrors `tsconfig.json` paths so `@/…` and `db` resolve in Vitest like Next/tsc. */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      db: path.resolve(__dirname, "./src/lib/db.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: ["**/node_modules/**", "**/tests/e2e/**", "**/.next/**"],
  },
});
