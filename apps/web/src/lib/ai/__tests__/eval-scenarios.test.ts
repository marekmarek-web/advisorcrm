import { describe, it, expect } from "vitest";
import { computeCompleteness } from "../context/completeness";
import { renderCompletenessHint } from "../context/completeness";
import { evalFixtures } from "./eval-fixtures";

describe("AI Phase 2 eval scenarios", () => {
  it("family with low reserve exposes reserve gap", () => {
    const raw = evalFixtures.familyLowReserve;
    const completeness = computeCompleteness(raw as never);
    const hint = renderCompletenessHint(completeness);
    expect(raw.financialSummary.reserveOk).toBe(false);
    expect(raw.financialSummary.reserveGap).toBeGreaterThan(0);
    expect(hint).toContain("Kvalita dat:");
  });

  it("minimal data has low completeness and missing areas", () => {
    const raw = evalFixtures.minimalData;
    const completeness = computeCompleteness(raw as never);
    expect(completeness.overall).toBe("low");
    expect(completeness.missingAreas).toContain("financial_analysis");
    expect(raw.contractsSummary).toHaveLength(0);
  });

  it("well covered client remains medium/high quality", () => {
    const raw = evalFixtures.wellCovered;
    const completeness = computeCompleteness(raw as never);
    expect(["high", "medium"]).toContain(completeness.overall);
    expect(raw.timelineEvents.length).toBeLessThanOrEqual(12);
  });

  it("stale client surfaces outdated analysis and no-contact risk", () => {
    const raw = evalFixtures.staleNoContact;
    const completeness = computeCompleteness(raw as never);
    expect(completeness.outdatedAreas).toContain("financial_analysis");
    expect(completeness.flags).toContain("no_contact_risk");
  });

  it("open deal fixture keeps active deal category", () => {
    const raw = evalFixtures.openDealNoDuplicate;
    expect(raw.activeDeals[0]?.dealCategory).toBe("active_deal");
    expect(raw.activeDeals[0]?.title.toLowerCase()).toContain("hypotéka");
  });
});
