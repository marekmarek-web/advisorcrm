import { describe, it, expect } from "vitest";
import {
  detectIdentityContactIntakeSignals,
  inferCreateContactDraftSource,
  mapFactBundleToCreateContactDraft,
  buildContactNewPrefillQuery,
  shouldSkipIdentityVersusActiveContactMatch,
} from "../image-intake/identity-contact-intake";
import { parseExplicitIntent } from "../image-intake/explicit-intent-parser";
import { buildIdentityContactIntakeActionPlan } from "../image-intake/planner";
import type {
  ExtractedFactBundle,
  ExtractedImageFact,
  InputClassificationResult,
} from "../image-intake/types";
import { mapToExecutionPlan } from "../image-intake/intake-execution-plan-mapper";

function fact(factKey: string, value: string, confidence = 0.9): ExtractedImageFact {
  return {
    factType: "reference_only",
    value,
    normalizedValue: value,
    confidence,
    evidence: null,
    isActionable: true,
    needsConfirmation: false,
    observedVsInferred: "observed",
    factKey,
  };
}

function bundle(facts: ExtractedImageFact[]): ExtractedFactBundle {
  return {
    facts,
    missingFields: [],
    ambiguityReasons: [],
    extractionSource: "multimodal_pass",
  };
}

describe("identity contact intake", () => {
  it("detectIdentityContactIntakeSignals is true for id doc facts", () => {
    const classification: InputClassificationResult = {
      inputType: "photo_or_scan_document",
      subtype: "document_scan_single_page",
      confidence: 0.9,
      containsText: true,
      likelyMessageThread: false,
      likelyDocument: true,
      likelyPayment: false,
      likelyFinancialInfo: false,
      uncertaintyFlags: [],
    };
    const b = bundle([
      fact("id_doc_is_identity_document", "yes", 0.9),
      fact("id_doc_first_name", "Jan", 0.8),
      fact("id_doc_last_name", "Novák", 0.8),
    ]);
    expect(detectIdentityContactIntakeSignals(classification, b, null)).toBe(true);
  });

  it("mapFactBundleToCreateContactDraft maps only schema fields and notes", () => {
    const b = bundle([
      fact("id_doc_first_name", "Jan", 0.9),
      fact("id_doc_last_name", "Novák", 0.9),
      fact("document_type", "OP", 0.7),
    ]);
    const d = mapFactBundleToCreateContactDraft(b);
    expect(d.draftSource).toBe("identity_document");
    expect(d.params.firstName).toBe("Jan");
    expect(d.params.lastName).toBe("Novák");
    expect(d.params.notes).toMatch(/OP/);
  });

  it("inferCreateContactDraftSource is crm_form_screenshot for crm_* facts without id doc", () => {
    const b = bundle([
      fact("crm_first_name", "Bohuslav", 0.9),
      fact("crm_last_name", "Plachý", 0.9),
      fact("crm_street", "Pod Křížkem 113", 0.85),
    ]);
    expect(inferCreateContactDraftSource(b)).toBe("crm_form_screenshot");
    const d = mapFactBundleToCreateContactDraft(b);
    expect(d.draftSource).toBe("crm_form_screenshot");
    expect(d.params.notes).toMatch(/formuláře|systému/);
    expect(d.params.firstName).toBe("Bohuslav");
  });

  it("shouldSkipIdentityVersusActiveContactMatch for create_contact + CRM screenshot", () => {
    const b = bundle([fact("crm_street", "X", 0.8), fact("crm_city", "Y", 0.8)]);
    const intent = parseExplicitIntent("Založ mi z těchto údajů klienta");
    expect(shouldSkipIdentityVersusActiveContactMatch(b, intent)).toBe(true);
  });

  it("buildIdentityContactIntakeActionPlan CRM wording for screenshot facts", () => {
    const b = bundle([
      fact("crm_street", "Pod Křížkem 113", 0.85),
      fact("crm_city", "Hoštka", 0.85),
      fact("crm_email", "a@b.cz", 0.9),
    ]);
    const plan = buildIdentityContactIntakeActionPlan(b, ["doc1"]);
    expect(plan.whyThisAction).toContain("formuláře");
    const exec = mapToExecutionPlan("i", plan, null, null);
    expect((exec.steps[0]!.params as Record<string, unknown>)._createContactDraftSource).toBe("crm_form_screenshot");
  });

  it("buildIdentityContactIntakeActionPlan + mapToExecutionPlan chains attach after create", () => {
    const b = bundle([fact("id_doc_first_name", "Jan", 0.9), fact("id_doc_last_name", "Test", 0.9)]);
    const plan = buildIdentityContactIntakeActionPlan(b, ["doc-a", "doc-b"]);
    expect(plan.whyThisAction).toContain("doklad");
    const exec = mapToExecutionPlan("intake_x", plan, null, null);
    expect(exec.steps).toHaveLength(3);
    expect(exec.steps[0]!.action).toBe("createContact");
    expect(exec.steps[1]!.action).toBe("attachDocumentToClient");
    expect(exec.steps[1]!.dependsOn).toEqual([exec.steps[0]!.stepId]);
    expect(exec.steps[1]!.params.documentId).toBe("doc-a");
  });

  it("buildContactNewPrefillQuery encodes prefill for contacts/new", () => {
    const d = mapFactBundleToCreateContactDraft(bundle([fact("id_doc_first_name", "A", 0.9)]));
    const q = buildContactNewPrefillQuery(d);
    expect(q).toContain("firstName=");
  });

  it("mapFactBundleToCreateContactDraft derives birthDate from birth_number when valid RC", () => {
    const d = mapFactBundleToCreateContactDraft(
      bundle([
        fact("id_doc_first_name", "A", 0.9),
        fact("id_doc_last_name", "B", 0.9),
        fact("birth_number", "900101/1239", 0.85),
      ]),
    );
    expect(d.params.personalId).toBe("900101/1239");
    expect(d.params.birthDate).toBe("1990-01-01");
    expect(d.needsConfirmationLines.some((l) => l.includes("odvozeno z rodného"))).toBe(true);
  });
});
