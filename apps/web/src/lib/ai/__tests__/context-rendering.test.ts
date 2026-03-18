import { describe, it, expect } from "vitest";
import { applyOutputGuardrails } from "../guardrails";
import {
  computeCompleteness,
  renderCompletenessHint,
} from "../context/completeness";
import { evalFixtures } from "./eval-fixtures";

describe("client context rendering", () => {
  it("captures missing contract field markers through completeness", () => {
    const raw = {
      ...evalFixtures.familyLowReserve,
      contractsSummary: [
        {
          ...evalFixtures.familyLowReserve.contractsSummary[0],
          contractNumber: null,
          premiumAmount: null,
          premiumAnnual: null,
        },
      ],
    };
    const completeness = computeCompleteness(raw as never);
    expect(completeness.missingAreas).toContain("contracts_detail");
  });

  it("renders context quality hint string", () => {
    const hint = renderCompletenessHint(computeCompleteness(evalFixtures.staleNoContact as never));
    expect(hint).toContain("Kvalita dat:");
    expect(hint.length).toBeGreaterThan(10);
  });

  it("guardrail prepends low-completeness disclaimer", () => {
    const completeness = computeCompleteness(evalFixtures.minimalData);
    const guarded = applyOutputGuardrails({
      promptType: "clientSummary",
      outputText: "Klient má několik možností.",
      completeness,
      variables: {},
      activeDealTitles: [],
    });
    expect(guarded.startsWith("Na základě neúplných dat:")).toBe(true);
  });
});
