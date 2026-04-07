import { describe, it, expect } from "vitest";
import { resolveIdentityCompleteness } from "../[id]/ContactIdentityCompletenessGuard";
import type { ContactAiProvenanceResult } from "@/app/actions/contacts";

const baseProvenance = (overrides: Partial<NonNullable<ContactAiProvenanceResult>> = {}): NonNullable<ContactAiProvenanceResult> => ({
  reviewId: "rev-001",
  appliedAt: "2025-01-15T10:00:00.000Z",
  confirmedFields: [],
  autoAppliedFields: [],
  pendingFields: [],
  manualRequiredFields: [],
  ...overrides,
});

describe("resolveIdentityCompleteness", () => {
  // -----------------------------------------------------------------------
  // A) Pole přítomno → vždy "ok"
  // -----------------------------------------------------------------------
  it("marks field ok when value is present (no provenance)", () => {
    const result = resolveIdentityCompleteness(
      { birthDate: "1985-03-22", personalId: "850322/1234" },
      null,
    );
    expect(result.every((r) => r.status === "ok")).toBe(true);
  });

  it("marks field ok when value present and also in confirmedFields", () => {
    const result = resolveIdentityCompleteness(
      { birthDate: "1985-03-22", personalId: null },
      baseProvenance({ confirmedFields: ["birthDate", "personalId"] }),
    );
    const bd = result.find((r) => r.key === "birthDate")!;
    expect(bd.status).toBe("ok");
    // personalId nemá hodnotu, ale je v confirmedFields → ok (byl zapsán jinak)
    const pid = result.find((r) => r.key === "personalId")!;
    expect(pid.status).toBe("ok");
  });

  it("marks field ok when value present and also in autoAppliedFields", () => {
    const result = resolveIdentityCompleteness(
      { birthDate: "1985-03-22", personalId: null },
      baseProvenance({ autoAppliedFields: ["personalId"] }),
    );
    const pid = result.find((r) => r.key === "personalId")!;
    expect(pid.status).toBe("ok");
  });

  // -----------------------------------------------------------------------
  // B) Pole chybí + pending AI
  // -----------------------------------------------------------------------
  it("marks field pending_ai when missing but in pendingFields", () => {
    const result = resolveIdentityCompleteness(
      { birthDate: null, personalId: null },
      baseProvenance({ pendingFields: ["birthDate"] }),
    );
    const bd = result.find((r) => r.key === "birthDate")!;
    expect(bd.status).toBe("pending_ai");
  });

  it("marks field manual when missing and not in pendingFields", () => {
    const result = resolveIdentityCompleteness(
      { birthDate: null, personalId: null },
      baseProvenance({ pendingFields: ["birthDate"] }),
    );
    const pid = result.find((r) => r.key === "personalId")!;
    expect(pid.status).toBe("manual");
  });

  // -----------------------------------------------------------------------
  // C) Pole chybí + žádná provenance
  // -----------------------------------------------------------------------
  it("marks field manual when missing and provenance is null", () => {
    const result = resolveIdentityCompleteness(
      { birthDate: null, personalId: null },
      null,
    );
    expect(result.every((r) => r.status === "manual")).toBe(true);
  });

  // -----------------------------------------------------------------------
  // D) Prázdný string → považován jako missing
  // -----------------------------------------------------------------------
  it("treats empty string as missing", () => {
    const result = resolveIdentityCompleteness(
      { birthDate: "", personalId: "  " },
      null,
    );
    expect(result.every((r) => r.status === "manual")).toBe(true);
  });

  // -----------------------------------------------------------------------
  // E) Supporting document guard — provenance bez contactEnforcement dat
  //    = pendingFields je prázdné → nesmí generovat AI pending CTA
  // -----------------------------------------------------------------------
  it("returns manual (not pending_ai) when provenance exists but pendingFields empty (supporting doc scenario)", () => {
    const result = resolveIdentityCompleteness(
      { birthDate: null, personalId: null },
      baseProvenance({ pendingFields: [] }),
    );
    expect(result.every((r) => r.status === "manual")).toBe(true);
  });

  // -----------------------------------------------------------------------
  // F) Must-pass anchor C017 Roman Koloburda UNIQA
  //    birthDate chybí, pendingFields má birthDate → pending_ai
  //    personalId chybí, žádný pending → manual
  // -----------------------------------------------------------------------
  it("C017 anchor: birthDate pending_ai, personalId manual", () => {
    const result = resolveIdentityCompleteness(
      { birthDate: null, personalId: null },
      baseProvenance({ pendingFields: ["birthDate"] }),
    );
    expect(result.find((r) => r.key === "birthDate")!.status).toBe("pending_ai");
    expect(result.find((r) => r.key === "personalId")!.status).toBe("manual");
  });

  // -----------------------------------------------------------------------
  // G) Must-pass anchor C029 Investiční smlouva Codya
  //    obě pole confirmed → guard tichý (všechny ok)
  // -----------------------------------------------------------------------
  it("C029 anchor: all confirmed → no completeness alert", () => {
    const result = resolveIdentityCompleteness(
      { birthDate: "1985-03-22", personalId: "850322/1234" },
      baseProvenance({
        confirmedFields: ["birthDate", "personalId"],
      }),
    );
    expect(result.every((r) => r.status === "ok")).toBe(true);
  });
});
