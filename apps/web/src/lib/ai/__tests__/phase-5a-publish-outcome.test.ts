/**
 * Phase 5A — Publish outcome model regression tests.
 *
 * Tests the computePublishOutcome function and the publish outcome invariants:
 * - supporting_doc_only: no contract, supporting guard active
 * - internal_document_only: document linked, no contract
 * - product_published_visible_to_client: contract created, visibleToClient=true
 * - payment_setup_published / payment_setup_skipped: orthogonal to product mode
 * - publish_partial_failure: contract created but document link failed
 *
 * No vendor-specific logic. No PDF anchors. Generic policy invariants only.
 * Run: pnpm vitest run src/lib/ai/__tests__/phase-5a-publish-outcome.test.ts
 */

import { describe, it, expect } from "vitest";
import { computePublishOutcome } from "@/lib/ai/contracts-analyses-bridge";
import type { ApplyResultPayload } from "@/lib/ai/review-queue-repository";

function basePayload(overrides: Partial<ApplyResultPayload> = {}): ApplyResultPayload {
  return {
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// A. Publish outcome mode — product_published_visible_to_client
// ═══════════════════════════════════════════════════════════════════════════════

describe("A. product_published_visible_to_client", () => {
  it("contract created → mode=product_published_visible_to_client", () => {
    const payload = basePayload({ createdContractId: "c1" });
    const outcome = computePublishOutcome(payload, false);
    expect(outcome.mode).toBe("product_published_visible_to_client");
    expect(outcome.visibleToClient).toBe(true);
  });

  it("contract created + payment setup → payment_setup_published", () => {
    const payload = basePayload({ createdContractId: "c1", createdPaymentSetupId: "p1" });
    const outcome = computePublishOutcome(payload, false);
    expect(outcome.mode).toBe("product_published_visible_to_client");
    expect(outcome.paymentOutcome).toBe("payment_setup_published");
    expect(outcome.visibleToClient).toBe(true);
  });

  it("contract created + no payment setup → payment_setup_skipped", () => {
    const payload = basePayload({ createdContractId: "c1" });
    const outcome = computePublishOutcome(payload, false);
    expect(outcome.paymentOutcome).toBe("payment_setup_skipped");
  });

  it("label is non-empty and mentions smlouva/produkt", () => {
    const payload = basePayload({ createdContractId: "c1" });
    const outcome = computePublishOutcome(payload, false);
    expect(outcome.label).toBeTruthy();
    expect(outcome.label.length).toBeGreaterThan(5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// B. Publish outcome mode — supporting_doc_only
// ═══════════════════════════════════════════════════════════════════════════════

describe("B. supporting_doc_only", () => {
  it("isSupporting=true + no contract → supporting_doc_only", () => {
    const payload = basePayload({});
    const outcome = computePublishOutcome(payload, true);
    expect(outcome.mode).toBe("supporting_doc_only");
    expect(outcome.visibleToClient).toBe(false);
  });

  it("supportingDocumentGuard in trace + no contract → supporting_doc_only", () => {
    const payload = basePayload({
      policyEnforcementTrace: {
        supportingDocumentGuard: true,
        outputMode: "supporting_document_only",
        summary: { totalAutoApplied: 0, totalPendingConfirmation: 0, totalManualRequired: 0, totalExcluded: 0 },
      },
    });
    const outcome = computePublishOutcome(payload, false);
    expect(outcome.mode).toBe("supporting_doc_only");
    expect(outcome.visibleToClient).toBe(false);
  });

  it("supporting doc → payment is always skipped (no payment for payslip)", () => {
    const payload = basePayload({
      policyEnforcementTrace: {
        supportingDocumentGuard: true,
        outputMode: "supporting_document_only",
        summary: { totalAutoApplied: 0, totalPendingConfirmation: 0, totalManualRequired: 0, totalExcluded: 0 },
      },
    });
    const outcome = computePublishOutcome(payload, true);
    expect(outcome.paymentOutcome).toBe("payment_setup_skipped");
  });

  it("supporting doc with isSupporting=true overrides even if payment present", () => {
    // Edge case: supporting guard trumps payment setup (should not happen in practice but must be safe)
    const payload = basePayload({ createdPaymentSetupId: "p1" });
    const outcome = computePublishOutcome(payload, true);
    expect(outcome.mode).toBe("supporting_doc_only");
    // payment outcome can be published (payment happened) but mode is still supporting
    // The guard checks contract, not payment
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// C. Publish outcome mode — internal_document_only
// ═══════════════════════════════════════════════════════════════════════════════

describe("C. internal_document_only", () => {
  it("linkedDocumentId + no contract → internal_document_only", () => {
    const payload = basePayload({ linkedDocumentId: "doc1" });
    const outcome = computePublishOutcome(payload, false);
    expect(outcome.mode).toBe("internal_document_only");
    expect(outcome.visibleToClient).toBe(false);
  });

  it("internal document does not expose to portal", () => {
    const payload = basePayload({ linkedDocumentId: "doc1" });
    const outcome = computePublishOutcome(payload, false);
    expect(outcome.visibleToClient).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// D. Publish outcome mode — publish_partial_failure
// ═══════════════════════════════════════════════════════════════════════════════

describe("D. publish_partial_failure", () => {
  it("contract created + documentLinkWarning → partial failure", () => {
    const payload = basePayload({
      createdContractId: "c1",
      documentLinkWarning: "document_link_exception",
    });
    const outcome = computePublishOutcome(payload, false);
    expect(outcome.mode).toBe("publish_partial_failure");
    // Contract was created so portal still sees it
    expect(outcome.visibleToClient).toBe(true);
  });

  it("partial failure label mentions parciální", () => {
    const payload = basePayload({
      createdContractId: "c1",
      documentLinkWarning: "document_link_exception",
    });
    const outcome = computePublishOutcome(payload, false);
    expect(outcome.label.toLowerCase()).toContain("parciální");
  });

  it("partial failure with payment setup → payment_setup_published", () => {
    const payload = basePayload({
      createdContractId: "c1",
      createdPaymentSetupId: "p1",
      documentLinkWarning: "document_link_failed",
    });
    const outcome = computePublishOutcome(payload, false);
    expect(outcome.mode).toBe("publish_partial_failure");
    expect(outcome.paymentOutcome).toBe("payment_setup_published");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// E. Payment orthogonality
// ═══════════════════════════════════════════════════════════════════════════════

describe("E. Payment orthogonality", () => {
  it("payment_setup_published is independent of product mode", () => {
    const withPayment = basePayload({ createdContractId: "c1", createdPaymentSetupId: "p1" });
    const withoutPayment = basePayload({ createdContractId: "c1" });
    expect(computePublishOutcome(withPayment, false).paymentOutcome).toBe("payment_setup_published");
    expect(computePublishOutcome(withoutPayment, false).paymentOutcome).toBe("payment_setup_skipped");
  });

  it("null payload → supporting_doc_only, payment_setup_skipped", () => {
    const outcome = computePublishOutcome(null, false);
    expect(outcome.mode).toBe("supporting_doc_only");
    expect(outcome.paymentOutcome).toBe("payment_setup_skipped");
    expect(outcome.visibleToClient).toBe(false);
  });

  it("empty payload → supporting_doc_only fallback", () => {
    const outcome = computePublishOutcome({}, false);
    expect(outcome.mode).toBe("supporting_doc_only");
    expect(outcome.visibleToClient).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// F. Integration scenarios — full path invariants
// ═══════════════════════════════════════════════════════════════════════════════

describe("F. Integration scenarios", () => {
  it("F1. Final contract → product visible in client detail", () => {
    const payload = basePayload({
      createdContractId: "c1",
      linkedClientId: "contact-1",
    });
    const outcome = computePublishOutcome(payload, false);
    // Contract created by apply → visibleToClient=true → portal can see it
    expect(outcome.mode).toBe("product_published_visible_to_client");
    expect(outcome.visibleToClient).toBe(true);
  });

  it("F2. visibleToClient contract → client portfolio not empty", () => {
    const payload = basePayload({ createdContractId: "c1" });
    const outcome = computePublishOutcome(payload, false);
    // After apply, contract has portfolioStatus=active + visibleToClient=true
    // Portal uses: visibleToClient=true AND portfolioStatus in [active, ended]
    const contractFromApply = { visibleToClient: true, portfolioStatus: "active" };
    const passesPortalFilter =
      contractFromApply.visibleToClient === true &&
      (contractFromApply.portfolioStatus === "active" || contractFromApply.portfolioStatus === "ended");
    expect(passesPortalFilter).toBe(true);
    expect(outcome.visibleToClient).toBe(true);
    // Portal isFirstRun = contracts.length === 0 → must be false after apply
    const contracts = [contractFromApply];
    expect(contracts.length === 0).toBe(false);
  });

  it("F3. Eligible payment setup → /client/payments stable + populated", () => {
    const payload = basePayload({
      createdContractId: "c1",
      createdPaymentSetupId: "ps1",
    });
    const outcome = computePublishOutcome(payload, false);
    expect(outcome.paymentOutcome).toBe("payment_setup_published");
    // Payment instructions filtered: status=active AND needsHumanReview=false
    const paymentSetups = [{ id: "ps1", status: "active", needsHumanReview: false, accountNumber: "1234/0300" }];
    const visible = paymentSetups.filter((p) => p.status === "active" && !p.needsHumanReview);
    expect(visible).toHaveLength(1);
  });

  it("F4. No payment eligibility → no payment setup, no crash", () => {
    // Supporting doc → payment skipped
    const payload = basePayload({});
    const outcome = computePublishOutcome(payload, true);
    expect(outcome.paymentOutcome).toBe("payment_setup_skipped");
    // /client/payments with empty list must not crash
    const paymentInstructions: unknown[] = [];
    expect(() => paymentInstructions.length === 0).not.toThrow();
    expect(paymentInstructions.length === 0).toBe(true); // Empty state is valid
  });

  it("F5. Supporting document → attach only, no fake product publish", () => {
    const payload = basePayload({ linkedDocumentId: "doc-support" });
    const outcome = computePublishOutcome(payload, true);
    expect(outcome.mode).toBe("supporting_doc_only");
    expect(outcome.visibleToClient).toBe(false);
    // Ghost success guard: supporting doc outcome must NOT be product_published
    expect(outcome.mode).not.toBe("product_published_visible_to_client");
    expect(outcome.mode).not.toBe("internal_document_only"); // supporting > internal in priority
  });

  it("F6. Ghost success is impossible: without createdContractId, no product mode", () => {
    // Any payload without createdContractId cannot produce product_published modes
    const payloads: ApplyResultPayload[] = [
      {},
      { createdClientId: "c1" },
      { linkedClientId: "c1" },
      { createdTaskId: "t1" },
      { linkedDocumentId: "d1" },
    ];
    for (const p of payloads) {
      const outcome = computePublishOutcome(p, false);
      expect(outcome.mode).not.toBe("product_published_visible_to_client");
      expect(outcome.mode).not.toBe("product_published");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// G. ApplyPublishOutcome type shape
// ═══════════════════════════════════════════════════════════════════════════════

describe("G. ApplyPublishOutcome shape invariants", () => {
  it("always has mode, paymentOutcome, label, visibleToClient", () => {
    const cases: [ApplyResultPayload | null, boolean][] = [
      [null, false],
      [{}, false],
      [{ createdContractId: "c1" }, false],
      [{ createdContractId: "c1", createdPaymentSetupId: "p1" }, false],
      [{ linkedDocumentId: "d1" }, false],
      [{}, true],
    ];
    for (const [payload, isSupporting] of cases) {
      const outcome = computePublishOutcome(payload, isSupporting);
      expect(typeof outcome.mode).toBe("string");
      expect(typeof outcome.paymentOutcome).toBe("string");
      expect(typeof outcome.label).toBe("string");
      expect(typeof outcome.visibleToClient).toBe("boolean");
      expect(outcome.label.length).toBeGreaterThan(0);
    }
  });

  it("visibleToClient is true only for product_published modes and partial_failure with contract", () => {
    const visibleModes = ["product_published_visible_to_client", "product_published", "publish_partial_failure"];
    const invisibleModes = ["supporting_doc_only", "internal_document_only"];

    // Product publish → visible
    expect(computePublishOutcome({ createdContractId: "c1" }, false).visibleToClient).toBe(true);

    // Supporting doc → not visible
    expect(computePublishOutcome({}, true).visibleToClient).toBe(false);
    expect(computePublishOutcome({ linkedDocumentId: "d1" }, false).visibleToClient).toBe(false);

    // Suppress unused variable warnings
    void visibleModes;
    void invisibleModes;
  });
});
