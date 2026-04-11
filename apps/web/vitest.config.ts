import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "vitest/config";

/** Minimal `.env.local` parse (KEY=value, # comments). Does not replace vars already set in process.env. */
function readEnvLocalForVitest(): Record<string, string> {
  const p = path.join(__dirname, ".env.local");
  if (!existsSync(p)) return {};
  const text = readFileSync(p, "utf8");
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

/** Inject `.env.local` into Vitest `process.env` for eval tests (OPENAI_API_KEY, Anthropic, …). */
function vitestEnvFromLocal(): Record<string, string> {
  const local = readEnvLocalForVitest();
  const injected: Record<string, string> = {};
  for (const [k, v] of Object.entries(local)) {
    if (process.env[k] === undefined || process.env[k] === "") {
      injected[k] = v;
    }
  }
  return injected;
}

/** Mirrors `tsconfig.json` paths so `@/…` and `db` resolve in Vitest like Next/tsc. */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      db: path.resolve(__dirname, "./src/lib/db.ts"),
      "server-only": path.resolve(__dirname, "./src/lib/test-shims/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: ["**/node_modules/**", "**/tests/e2e/**", "**/.next/**"],
    env: vitestEnvFromLocal(),
    /** ESM-only deps must be inlined when Vitest resolves from apps/web without hoisted symlinks. */
    server: {
      deps: {
        inline: ["date-fns", "date-fns-tz"],
      },
    },
  },
});
