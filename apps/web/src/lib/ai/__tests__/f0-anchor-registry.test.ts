/**
 * F0 — fixture integrity: registry + golden expectations + PDF paths exist.
 * Bez LLM, bez sítě. Běží v běžném `pnpm test` (apps/web).
 */
import { describe, expect, it } from "vitest";
import {
  anchorPdfExists,
  loadAnchorGoldenExpectations,
  loadAnchorRegistry,
  F0_REPO_ROOT,
} from "./f0-anchor-registry";

describe("F0 — anchor registry + golden expectations fixtures", () => {
  it("loads anchor-registry.json", () => {
    const reg = loadAnchorRegistry();
    expect(reg.version).toBe(1);
    expect(reg.anchors.length).toBeGreaterThanOrEqual(6);
    const ids = new Set(reg.anchors.map((a) => a.id));
    expect(ids.has("MAXIMA")).toBe(true);
    expect(ids.has("AMUNDI")).toBe(true);
  });

  it("every registry anchor has a PDF on disk (or test env is incomplete)", () => {
    const reg = loadAnchorRegistry();
    const missing: string[] = [];
    for (const a of reg.anchors) {
      if (!anchorPdfExists(a.file)) missing.push(`${a.id}: ${a.file}`);
    }
    expect(missing, `Missing PDFs under ${F0_REPO_ROOT}:\n${missing.join("\n")}`).toEqual([]);
  });

  it("loads anchor-golden-expectations.json and ids match registry", () => {
    const reg = loadAnchorRegistry();
    const exp = loadAnchorGoldenExpectations();
    expect(exp.version).toBe(1);
    const regIds = new Set(reg.anchors.map((a) => a.id));
    for (const e of exp.expectations) {
      expect(regIds.has(e.id), `expectation id ${e.id} not in anchor-registry`).toBe(true);
      expect(e.expectedPrimaryTypes.length).toBeGreaterThan(0);
      expect(e.mustHaveAnyOf.length).toBeGreaterThan(0);
    }
    expect(exp.expectations.length).toBe(reg.anchors.length);
  });
});
