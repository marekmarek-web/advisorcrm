import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

/** Repo root = apps/web/../../ from cwd when running vitest in apps/web */
function manifestPath(): string {
  return path.join(process.cwd(), "..", "..", "fixtures", "golden-ai-review", "scenarios.manifest.json");
}

describe("golden-dataset manifest (phase 1)", () => {
  it("parses and lists at least 12 scenarios with ids and families", () => {
    const p = manifestPath();
    expect(existsSync(p)).toBe(true);
    const raw = JSON.parse(readFileSync(p, "utf8")) as {
      version: number;
      scenarios: Array<{
        id: string;
        documentFamily: string;
        assistantOnly?: boolean;
      }>;
    };
    expect(raw.version).toBe(1);
    expect(Array.isArray(raw.scenarios)).toBe(true);
    expect(raw.scenarios.length).toBeGreaterThanOrEqual(12);
    for (const s of raw.scenarios) {
      expect(s.id).toMatch(/^G\d{2}$/);
      expect(typeof s.documentFamily).toBe("string");
      expect(s.documentFamily.length).toBeGreaterThan(0);
    }
  });
});
