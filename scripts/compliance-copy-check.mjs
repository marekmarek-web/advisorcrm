#!/usr/bin/env node
/**
 * Advisory scan for risky Czech compliance phrases in product UI code.
 * Allowlist paths that intentionally use "referral" wording or fixtures.
 * See `.cursor/rules/aidvisor-compliance.mdc`.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const SCAN_ROOT = join(REPO_ROOT, "apps", "web", "src");
const EXT = new Set([".ts", ".tsx"]);

/** Path fragments — if matched, file is skipped entirely */
const ALLOWLIST = [
  "lib/service-engine/PHASE5_SUMMARY.md",
  "__tests__",
  ".test.ts",
  ".spec.ts",
];

const PATTERNS = [{ name: "doporučujeme (platform voice)", re: /\bdoporučujeme\b/i }];

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.isFile() && EXT.has(extname(e.name))) out.push(p);
  }
  return out;
}

function main() {
  let statRoot;
  try {
    statRoot = statSync(SCAN_ROOT);
  } catch {
    console.warn("compliance-copy-check: apps/web/src missing, skip.");
    process.exit(0);
  }
  if (!statRoot.isDirectory()) {
    console.warn("compliance-copy-check: apps/web/src not a directory, skip.");
    process.exit(0);
  }

  const files = walk(SCAN_ROOT);
  const hits = [];

  for (const abs of files) {
    const rel = relative(REPO_ROOT, abs).replace(/\\/g, "/");
    if (ALLOWLIST.some((a) => rel.includes(a))) continue;
    const text = readFileSync(abs, "utf8");
    for (const { name, re } of PATTERNS) {
      if (re.test(text)) {
        hits.push({ file: rel, pattern: name });
        break;
      }
    }
  }

  if (hits.length > 0) {
    console.error("compliance-copy-check: potential issues (see aidvisor-compliance rule):");
    for (const h of hits) console.error(`  ${h.file} — ${h.pattern}`);
    process.exit(1);
  }

  console.log("compliance-copy-check: OK (no banned \"doporučujeme\" in scanned TS/TSX).");
  process.exit(0);
}

main();
