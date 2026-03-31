#!/usr/bin/env node
/**
 * Registers repo-local Git hooks (.githooks). Safe no-op without .git (e.g. tarball).
 */
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
if (!existsSync(join(root, ".git"))) process.exit(0);
try {
  execSync("git config core.hooksPath .githooks", { cwd: root, stdio: "inherit" });
} catch {
  process.exit(0);
}
