import { describe, it, expect } from "vitest";
import { buildExecutionPlan } from "../assistant-execution-plan";
import { emptyCanonicalIntent, type CanonicalIntent } from "../assistant-domain-model";
import {
  birthDateFromCzechPersonalId,
  czechPersonalIdMod11Valid,
  enrichBirthDateFromPersonalIdInParams,
  fullBirthYearFromYy,
} from "../czech-personal-id-birth-date";

type Resolution = Parameters<typeof buildExecutionPlan>[1];

const emptyResolution: Resolution = {
  client: null,
  opportunity: null,
  document: null,
  contract: null,
  warnings: [],
};

function intent(partial: Partial<CanonicalIntent>): CanonicalIntent {
  return { ...emptyCanonicalIntent(), ...partial };
}

describe("birthDateFromCzechPersonalId", () => {
  const refY = 2026;

  it("parses male date with valid mod-11 (10 digits)", () => {
    expect(birthDateFromCzechPersonalId("9001011239", refY)).toBe("1990-01-01");
  });

  it("parses female month +50 with valid mod-11", () => {
    expect(birthDateFromCzechPersonalId("9053150007", refY)).toBe("1990-03-15");
  });

  it("parses 21st century male", () => {
    expect(birthDateFromCzechPersonalId("1003150005", refY)).toBe("2010-03-15");
  });

  it("returns null for invalid check digit (10 digits)", () => {
    expect(birthDateFromCzechPersonalId("9001011234", refY)).toBeNull();
  });

  it("accepts 9 digits without mod-11", () => {
    expect(birthDateFromCzechPersonalId("530101123", refY)).toBe("1953-01-01");
  });

  it("returns null for impossible month raw (13–50)", () => {
    expect(birthDateFromCzechPersonalId("9013321234", refY)).toBeNull();
  });

  it("returns null for wrong length", () => {
    expect(birthDateFromCzechPersonalId("90010112", refY)).toBeNull();
    expect(birthDateFromCzechPersonalId("", refY)).toBeNull();
  });

  it("returns null for invalid calendar day (9 digits, skip mod-11)", () => {
    expect(birthDateFromCzechPersonalId("900231123", refY)).toBeNull();
  });
});

describe("czechPersonalIdMod11Valid", () => {
  it("matches known valid and invalid samples", () => {
    expect(czechPersonalIdMod11Valid("9001011239")).toBe(true);
    expect(czechPersonalIdMod11Valid("9001011234")).toBe(false);
    expect(czechPersonalIdMod11Valid("900101123")).toBe(true);
  });
});

describe("fullBirthYearFromYy", () => {
  it("uses 19xx when yy is clearly past century", () => {
    expect(fullBirthYearFromYy(90, 2026)).toBe(1990);
  });
  it("uses 20xx for recent yy", () => {
    expect(fullBirthYearFromYy(10, 2026)).toBe(2010);
  });
});

describe("buildExecutionPlan + enrichBirthDateFromPersonalId", () => {
  it("enriches createContact step params from personalId", () => {
    const plan = buildExecutionPlan(
      intent({
        intentType: "create_contact",
        requestedActions: ["create_contact"],
        extractedFacts: [
          { key: "firstName", value: "Jan", source: "user_text" },
          { key: "lastName", value: "Test", source: "user_text" },
          { key: "personalId", value: "900101/1239", source: "user_text" },
        ],
      }),
      emptyResolution,
    );
    const step = plan.steps.find((s) => s.action === "createContact");
    expect(step?.params.birthDate).toBe("1990-01-01");
  });

  it("does not overwrite explicit birthDate on createContact", () => {
    const plan = buildExecutionPlan(
      intent({
        intentType: "create_contact",
        requestedActions: ["create_contact"],
        extractedFacts: [
          { key: "firstName", value: "Jan", source: "user_text" },
          { key: "lastName", value: "Test", source: "user_text" },
          { key: "personalId", value: "900101/1239", source: "user_text" },
          { key: "birthDate", value: "1988-05-05", source: "user_text" },
        ],
      }),
      emptyResolution,
    );
    const step = plan.steps.find((s) => s.action === "createContact");
    expect(step?.params.birthDate).toBe("1988-05-05");
  });
});

describe("enrichBirthDateFromPersonalIdInParams", () => {
  it("fills birthDate from personalId when birthDate missing", () => {
    const p: Record<string, unknown> = { personalId: "900101/1239" };
    enrichBirthDateFromPersonalIdInParams(p);
    expect(p.birthDate).toBe("1990-01-01");
  });

  it("does not overwrite explicit birthDate", () => {
    const p: Record<string, unknown> = { personalId: "900101/1239", birthDate: "1985-06-06" };
    enrichBirthDateFromPersonalIdInParams(p);
    expect(p.birthDate).toBe("1985-06-06");
  });
});
