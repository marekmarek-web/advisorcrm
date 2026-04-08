import { describe, expect, it } from "vitest";
import { buildTerminationLetterResult } from "../termination-letter-builder";

describe("termination letter address order", () => {
  it("places Pojistník block before Pojišťovna before Věc", () => {
    const r = buildTerminationLetterResult({
      request: {
        insurerName: "Test POV a.s.",
        contractNumber: "123",
        productSegment: "ZP",
        terminationMode: "end_of_insurance_period",
        terminationReasonCode: "end_of_period_6_weeks",
        requestedEffectiveDate: "2026-06-15",
        computedEffectiveDate: "2026-06-15",
        contractStartDate: null,
        contractAnniversaryDate: null,
        deliveryChannel: "postal_mail",
        freeformLetterAllowed: true,
        requiresInsurerForm: false,
        reviewRequiredReason: null,
        status: "intake",
        deliveryAddressSnapshot: null,
      },
      contact: {
        firstName: "Jan",
        lastName: "Novák",
        title: null,
        birthDate: null,
        personalId: null,
        street: "Hlavní 1",
        city: "Praha",
        zip: "12000",
        email: null,
        phone: null,
      },
      contract: null,
      insurerRegistry: {
        insurerName: "Test POV a.s.",
        officialFormName: null,
        officialFormNotes: null,
        mailingAddress: {
          street: "Pobočková 2",
          city: "Brno",
          zip: "60200",
        },
      },
      reasonLabel: "Výpověď",
      attachmentLabels: [],
      documentBuilderExtras: { attachmentsDeclared: "občanka, technický průkaz" },
    });
    expect(r.letterPlainText).toBeTruthy();
    const t = r.letterPlainText!;
    const pPojistnik = t.indexOf("Pojistník");
    const pPojistovna = t.indexOf("Pojišťovna");
    const pVec = t.indexOf("Věc:");
    expect(pPojistnik).toBeGreaterThanOrEqual(0);
    expect(pPojistovna).toBeGreaterThan(pPojistnik);
    expect(pVec).toBeGreaterThan(pPojistovna);
    expect(t).toContain("občanka");
  });

  it("merges incomplete delivery snapshot with registry so street appears in letter", () => {
    const r = buildTerminationLetterResult({
      request: {
        insurerName: "česká",
        contractNumber: "123",
        productSegment: "ZP",
        terminationMode: "end_of_insurance_period",
        terminationReasonCode: "end_of_period_6_weeks",
        requestedEffectiveDate: "2026-06-15",
        computedEffectiveDate: "2026-06-15",
        contractStartDate: null,
        contractAnniversaryDate: null,
        deliveryChannel: "postal_mail",
        freeformLetterAllowed: true,
        requiresInsurerForm: false,
        reviewRequiredReason: null,
        status: "intake",
        deliveryAddressSnapshot: { name: "česká" },
      },
      contact: {
        firstName: "Jan",
        lastName: "Novák",
        title: null,
        birthDate: null,
        personalId: null,
        street: "Hlavní 1",
        city: "Praha",
        zip: "12000",
        email: null,
        phone: null,
      },
      contract: null,
      insurerRegistry: {
        insurerName: "Česká podnikatelská pojišťovna, a.s., Vienna Insurance Group",
        officialFormName: null,
        officialFormNotes: null,
        mailingAddress: {
          name: "Česká podnikatelská pojišťovna, a.s., Vienna Insurance Group",
          street: "P.O.BOX 28",
          city: "Modřice",
          zip: "664 42",
          country: "CZ",
        },
      },
      reasonLabel: "Výpověď",
      attachmentLabels: [],
    });
    expect(r.letterPlainText).toBeTruthy();
    const t = r.letterPlainText!;
    expect(t).toContain("P.O.BOX 28");
    expect(t).toContain("Modřice");
    expect(t).toContain("664 42");
  });
});
