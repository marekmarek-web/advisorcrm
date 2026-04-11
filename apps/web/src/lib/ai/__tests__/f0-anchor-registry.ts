/**
 * F0 — shared loader for anchor-registry.json + anchor-golden-expectations.json (monorepo fixtures).
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __testDir = dirname(__filename);
/** apps/web */
const appsWebRoot = join(__testDir, "../../../..");
/** Monorepo root (parent of apps/) */
export const F0_REPO_ROOT = join(appsWebRoot, "..", "..");

export type AnchorRegistryEntry = {
  id: string;
  label: string;
  file: string;
};

export type AnchorRegistryFile = {
  version: number;
  description?: string;
  anchors: AnchorRegistryEntry[];
};

export type GoldenExpectationEntry = {
  id: string;
  segment: string;
  expectedPrimaryTypes: string[];
  forbiddenPrimaryTypes?: string[];
  /** Each inner array is OR; outer arrays are AND (at least one field per group). */
  mustHaveAnyOf: string[][];
};

export type AnchorGoldenExpectationsFile = {
  version: number;
  description?: string;
  expectations: GoldenExpectationEntry[];
};

const REGISTRY_PATH = join(F0_REPO_ROOT, "fixtures/golden-ai-review/anchor-registry.json");
const EXPECTATIONS_PATH = join(F0_REPO_ROOT, "fixtures/golden-ai-review/anchor-golden-expectations.json");

export function loadAnchorRegistry(): AnchorRegistryFile {
  return JSON.parse(readFileSync(REGISTRY_PATH, "utf8")) as AnchorRegistryFile;
}

export function loadAnchorGoldenExpectations(): AnchorGoldenExpectationsFile {
  return JSON.parse(readFileSync(EXPECTATIONS_PATH, "utf8")) as AnchorGoldenExpectationsFile;
}

/** Original 6-anchor subset for fast debug runs (`ANCHOR_SET=core`). */
export const F0_CORE_ANCHOR_IDS = ["GCP", "AMUNDI", "MAXIMA", "CSOB", "PAYSLIP", "TAX"] as const;

export function resolveAnchorPdfPath(repoRelativePath: string): string {
  return join(F0_REPO_ROOT, repoRelativePath);
}

export function anchorPdfExists(repoRelativePath: string): boolean {
  return existsSync(resolveAnchorPdfPath(repoRelativePath));
}
