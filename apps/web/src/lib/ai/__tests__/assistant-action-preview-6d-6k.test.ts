/**
 * Plán 6D / 6K — čisté labely + doména jen v chipu; regresní kontroly výběru kroků a deduplikace.
 */
import { describe, it, expect } from "vitest";
import { buildExecutionPlan, applyConfirmationSelection, productDomainChipLabel, getPlanSummary } from "@/lib/ai/assistant-execution-plan";
import { emptyCanonicalIntent, type CanonicalIntent } from "@/lib/ai/assistant-domain-model";
import type { EntityResolutionResult } from "@/lib/ai/assistant-entity-resolution";

const CONTACT_ID = "11111111-1111-1111-1111-111111111111";

function resolutionWithClient(): EntityResolutionResult {
  return {
    client: { entityId: CONTACT_ID, displayLabel: "Test Novák", ref: "Test Novák" },
    warnings: [],
  };
}

function intent(partial: Partial<CanonicalIntent> & Pick<CanonicalIntent, "intentType">): CanonicalIntent {
  return {
    ...emptyCanonicalIntent(),
    ...partial,
    requestedActions: partial.requestedActions ?? [],
    extractedFacts: partial.extractedFacts ?? emptyCanonicalIntent().extractedFacts,
    temporalExpressions: partial.temporalExpressions ?? [],
    missingFields: partial.missingFields ?? [],
    userConstraints: partial.userConstraints ?? [],
  };
}

describe("6D — productDomainChipLabel a label kroku bez duplicitní domény", () => {
  it("hypo → chip Hypotéka, ne raw hypo", () => {
    expect(productDomainChipLabel("hypo")).toBe("Hypotéka");
  });

  it("jine → žádný chip", () => {
    expect(productDomainChipLabel("jine")).toBeUndefined();
  });

  it("prázdné → žádný chip", () => {
    expect(productDomainChipLabel("")).toBeUndefined();
    expect(productDomainChipLabel(undefined)).toBeUndefined();
  });

  it("krok createOpportunity + hypo má čistý titulek bez závorky domény", () => {
    const plan = buildExecutionPlan(
      intent({
        intentType: "create_opportunity",
        requestedActions: ["create_opportunity"],
        productDomain: "hypo",
      }),
      resolutionWithClient(),
    );
    const step = plan.steps[0];
    expect(step?.label).toBe("Vytvořit obchod");
    expect(step?.label).not.toMatch(/\(/);
    expect(step?.label.toLowerCase()).not.toContain("hypo");
  });

  it("getPlanSummary přidá doménu jen jednou jako · Hypotéka", () => {
    const plan = buildExecutionPlan(
      intent({
        intentType: "create_material_request",
        requestedActions: ["create_material_request"],
        productDomain: "hypo",
      }),
      resolutionWithClient(),
    );
    const summary = getPlanSummary(plan);
    expect(summary).toContain("Vyžádat podklady");
    expect(summary).toContain("· Hypotéka");
    expect(summary).not.toMatch(/\(Hypotéka\).*\(Hypotéka\)/);
  });
});

describe("6K — výběr kroků a deduplikace", () => {
  it("multi_action se stejným write intentem dvakrát → jeden krok createMaterialRequest", () => {
    const plan = buildExecutionPlan(
      intent({
        intentType: "multi_action",
        requestedActions: ["create_material_request", "create_material_request"],
        productDomain: "hypo",
      }),
      resolutionWithClient(),
    );
    const mats = plan.steps.filter((s) => s.action === "createMaterialRequest");
    expect(mats).toHaveLength(1);
  });

  it("applyConfirmationSelection: vybran jen jeden z dvou kroků → druhý skipped", () => {
    const plan = buildExecutionPlan(
      intent({
        intentType: "multi_action",
        requestedActions: ["create_internal_note", "create_task"],
        productDomain: null,
      }),
      resolutionWithClient(),
    );
    expect(plan.steps.length).toBeGreaterThanOrEqual(2);
    const [a, b] = plan.steps;
    const selected = applyConfirmationSelection(plan, [a!.stepId]);
    const byId = Object.fromEntries(selected.steps.map((s) => [s.stepId, s.status]));
    expect(byId[a!.stepId]).toBe("confirmed");
    expect(byId[b!.stepId]).toBe("skipped");
  });

  it("applyConfirmationSelection: prázdný výběr → všechny awaiting zůstanou skipped při prázdném selected", () => {
    const plan = buildExecutionPlan(
      intent({
        intentType: "create_task",
        requestedActions: ["create_task"],
        productDomain: null,
      }),
      resolutionWithClient(),
    );
    expect(plan.steps.length).toBe(1);
    const sid = plan.steps[0]!.stepId;
    const out = applyConfirmationSelection(plan, []);
    expect(out.steps[0]?.status).toBe("skipped");
    expect(out.steps[0]?.result?.outcome).toBe("skipped");
    expect(out.steps[0]?.stepId).toBe(sid);
  });
});
