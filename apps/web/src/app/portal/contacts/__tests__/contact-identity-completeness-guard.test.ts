import { describe, it, expect } from "vitest";
import { resolveIdentityCompleteness } from "../[id]/contact-identity-completeness-logic";
import type { ContactProvenanceInput } from "../[id]/contact-identity-completeness-logic";

const baseProvenance = (overrides: Partial<NonNullable<ContactProvenanceInput>> = {}): NonNullable<ContactProvenanceInput> => ({
  reviewId: "rev-001",
  confirmedFields: [],
  autoAppliedFields: [],
  pendingFields: [],
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

  // -----------------------------------------------------------------------
  // H) Fáze 15: Po inline confirmu — pole přejde z pending_ai do ok
  //    (simulace: confirmedFields nyní obsahuje potvrzené pole)
  // -----------------------------------------------------------------------
  it("Phase 15: after confirm, birthDate moves to ok (appears in confirmedFields)", () => {
    const result = resolveIdentityCompleteness(
      { birthDate: null, personalId: null },
      baseProvenance({
        confirmedFields: ["birthDate"],
        pendingFields: ["personalId"],
      }),
    );
    expect(result.find((r) => r.key === "birthDate")!.status).toBe("ok");
    expect(result.find((r) => r.key === "personalId")!.status).toBe("pending_ai");
  });

  it("Phase 15: after confirming all pending fields, guard returns empty (all ok)", () => {
    const result = resolveIdentityCompleteness(
      { birthDate: null, personalId: null },
      baseProvenance({
        confirmedFields: ["birthDate", "personalId"],
        pendingFields: [],
      }),
    );
    expect(result.every((r) => r.status === "ok")).toBe(true);
  });

  // -----------------------------------------------------------------------
  // I) Fáze 15: Supporting docs — nesmí generovat pending_ai CTA
  //    (pendingFields je prázdné, pokud contact enforcement nevznikl)
  // -----------------------------------------------------------------------
  it("Phase 15: C022/C040 supporting doc — no pending_ai CTA when pendingFields empty", () => {
    const result = resolveIdentityCompleteness(
      { birthDate: null, personalId: null },
      baseProvenance({
        pendingFields: [],
        autoAppliedFields: [],
        confirmedFields: [],
      }),
    );
    expect(result.every((r) => r.status === "manual")).toBe(true);
  });

  // -----------------------------------------------------------------------
  // J) Fáze 15: Must-pass anchor C030 IŽP Generali
  //    birthDate + personalId pending → oba v pending_ai
  // -----------------------------------------------------------------------
  it("C030 anchor: both identity fields pending → both pending_ai", () => {
    const result = resolveIdentityCompleteness(
      { birthDate: null, personalId: null },
      baseProvenance({ pendingFields: ["birthDate", "personalId"] }),
    );
    expect(result.find((r) => r.key === "birthDate")!.status).toBe("pending_ai");
    expect(result.find((r) => r.key === "personalId")!.status).toBe("pending_ai");
  });

  // -----------------------------------------------------------------------
  // K) Fáze 15: manual pole nesmí dostat pending_ai status
  //    i když reviewId existuje (jen protože provenance je přítomna)
  // -----------------------------------------------------------------------
  it("Phase 15: manual fields stay manual even when provenance/reviewId present", () => {
    const result = resolveIdentityCompleteness(
      { birthDate: null, personalId: null },
      baseProvenance({
        pendingFields: ["birthDate"],
        // personalId není v pendingFields → manual
      }),
    );
    expect(result.find((r) => r.key === "personalId")!.status).toBe("manual");
  });
});
