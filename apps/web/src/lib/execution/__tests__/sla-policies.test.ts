import { describe, it, expect } from "vitest";
import { evaluateSLA, checkSLABreaches, getSLAPolicy, SLA_POLICIES } from "../sla-policies";

describe("evaluateSLA", () => {
  it("returns ok below warning", () => {
    expect(evaluateSLA("review_resolution", 10).level).toBe("ok");
  });

  it("returns warning at warning threshold", () => {
    expect(evaluateSLA("review_resolution", 50).level).toBe("warning");
  });

  it("returns breach at breach threshold", () => {
    expect(evaluateSLA("review_resolution", 100).level).toBe("breach");
  });

  it("returns ok for unknown policy", () => {
    expect(evaluateSLA("nonexistent", 999).level).toBe("ok");
  });
});

describe("checkSLABreaches", () => {
  it("detects review breach", () => {
    const breaches = checkSLABreaches([
      { entityType: "review", entityId: "r1", ageHours: 100 },
    ]);
    expect(breaches.length).toBeGreaterThanOrEqual(1);
    expect(breaches[0].level).toBe("breach");
    expect(breaches[0].policyCode).toBe("review_resolution");
  });

  it("returns empty for ok items", () => {
    const breaches = checkSLABreaches([
      { entityType: "review", entityId: "r1", ageHours: 10 },
    ]);
    expect(breaches).toHaveLength(0);
  });

  it("detects payment warning", () => {
    const breaches = checkSLABreaches([
      { entityType: "payment", entityId: "p1", ageHours: 30 },
    ]);
    expect(breaches).toHaveLength(1);
    expect(breaches[0].level).toBe("warning");
  });
});

describe("SLA_POLICIES", () => {
  it("has all expected policies", () => {
    expect(SLA_POLICIES.length).toBe(5);
  });

  it("getSLAPolicy returns undefined for unknown", () => {
    expect(getSLAPolicy("nope")).toBeUndefined();
  });
});
