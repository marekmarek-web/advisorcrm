import { describe, expect, it } from "vitest";
import { buildStepDescription } from "../../assistant-execution-plan";
import { buildFactsSummaryLines } from "../extractor";
import {
  formatBirthDateLineForAdvisor,
  formatFactValueForAdvisorDisplay,
} from "../fact-value-display";
import type { ExtractedFactBundle, ExtractedImageFact } from "../types";

function minimalFact(overrides: Partial<ExtractedImageFact>): ExtractedImageFact {
  return {
    factType: "document_received",
    value: "",
    normalizedValue: null,
    confidence: 0.9,
    evidence: null,
    isActionable: false,
    needsConfirmation: false,
    observedVsInferred: "observed",
    factKey: "birth_date",
    ...overrides,
  };
}

describe("formatFactValueForAdvisorDisplay", () => {
  it("formats ISO birth_date as DD.MM.YYYY", () => {
    expect(formatFactValueForAdvisorDisplay("birth_date", "1959-04-30")).toBe("30.04.1959");
  });

  it("formats id_doc_birth_date", () => {
    expect(formatFactValueForAdvisorDisplay("id_doc_birth_date", "1982-09-16")).toBe("16.09.1982");
  });

  it("passes through non-date keys unchanged", () => {
    expect(formatFactValueForAdvisorDisplay("first_name", "Josef")).toBe("Josef");
  });
});

describe("formatBirthDateLineForAdvisor", () => {
  it("returns undefined for empty input", () => {
    expect(formatBirthDateLineForAdvisor(undefined)).toBeUndefined();
    expect(formatBirthDateLineForAdvisor("  ")).toBeUndefined();
  });

  it("returns DD.MM.YYYY for ISO", () => {
    expect(formatBirthDateLineForAdvisor("1959-04-30")).toBe("30.04.1959");
  });
});

describe("buildFactsSummaryLines", () => {
  it("shows birth date as DD.MM.YYYY not ISO", () => {
    const bundle: ExtractedFactBundle = {
      facts: [
        minimalFact({
          factKey: "birth_date",
          value: "1959-04-30",
          confidence: 0.9,
        }),
      ],
      missingFields: [],
      ambiguityReasons: [],
      extractionSource: "multimodal_pass",
    };
    const lines = buildFactsSummaryLines(bundle, 6);
    expect(lines[0]).toContain("30.04.1959");
    expect(lines[0]).not.toContain("1959-04-30");
  });
});

describe("buildStepDescription scheduleCalendarEvent", () => {
  it("formats calendar date as DD.MM.YYYY for advisor", () => {
    expect(
      buildStepDescription("scheduleCalendarEvent", {
        resolvedDate: "2026-04-10",
        title: "Schůzka",
      }),
    ).toBe("10.04.2026 · Schůzka");
  });

  it("formats date-only from startAt ISO string", () => {
    expect(
      buildStepDescription("scheduleCalendarEvent", {
        startAt: "2026-04-10T14:30:00+02:00",
        taskTitle: "Call",
      }),
    ).toBe("10.04.2026 · Call");
  });
});
