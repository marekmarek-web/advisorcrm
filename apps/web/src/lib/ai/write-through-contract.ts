/**
 * Write-through contract: explicit definition of expected downstream state
 * after a successful approved/applied AI contract review.
 *
 * This file is the canonical reference for what "apply" must produce.
 * It does not hardcode any vendor, institution, PDF filename, or product name.
 *
 * Enforcement happens in: apply-contract-review.ts, contract-review.ts (actions),
 * apply-coverage-from-review.ts, and the portal read queries.
 */

import type {
  ApplyPublishOutcome,
  ApplyResultPayload,
  ContractReviewRow,
} from "@/lib/ai/review-queue-repository";

export type WriteThroughExpectedState = {
  /**
   * 1. CONTACT
   * Created (new) or updated (existing) with all extractable identity fields:
   * firstName, lastName, email, phone, birthDate, personalId, street, city, zip.
   * Merge policy: auto_fill for new values, flag_pending for conflicts.
   */
  contact: {
    created: boolean;
    linkedId: string;
    mergedIdentityFields: string[];
    pendingConflictFields: string[];
  };

  /**
   * 2. CONTRACT
   * Row in `contracts` table with:
   * - segment, type (canonical segment code)
   * - partnerName, productName (text from extraction)
   * - partnerId, productId (FK from catalog if name matches; null = no catalog match, not an error)
   * - startDate, premiumAmount, premiumAnnual
   * - visibleToClient: true (portal-visible immediately after apply)
   * - portfolioStatus: "active"
   * - sourceContractReviewId: linked back to the review that created it
   * - sourceDocumentId: linked to the document row (set in post-commit)
   */
  contract: {
    created: boolean;
    contractId: string;
    visibleToClient: true;
    portfolioStatus: "active";
    partnerIdLinked: boolean;
    productIdLinked: boolean;
    sourceDocumentIdLinked: boolean;
  };

  /**
   * 3. COVERAGE (contact_coverage)
   * One or more rows, one per coverage item:
   * - segment-level item (from SEGMENT_TO_COVERAGE_ITEM mapping) when no explicit list
   * - explicit items from extraction envelope's coverageList[] when present
   * Status: "done", linkedContractId set.
   */
  coverage: {
    rowsWritten: number;
    itemKeys: string[];
  };

  /**
   * 4. PAYMENT (client_payment_setups)
   * Written ONLY when:
   * a) enforcePaymentPayload returns at least one usable field, AND
   * b) document lifecycle is not "modelation" or "illustration", AND
   * c) isPaymentSyncReady(canonical) returns true.
   * needsHumanReview = true when prefill_confirm fields are present (advisor must confirm).
   * Never written from supporting/informational documents (isSupportingDocumentOnly guard).
   */
  payment:
    | {
        written: true;
        paymentSetupId: string;
        needsHumanReview: boolean;
      }
    | {
        written: false;
        reason:
          | "no_usable_payment_data"
          | "supporting_document_guard"
          | "non_final_lifecycle"
          | "payment_not_sync_ready"
          | "no_payment_action";
      };

  /**
   * 5. DOCUMENT (documents table)
   * Row linked to the same file as the AI review.
   * - visibleToClient: true
   * - contractId: set to the contract row created/updated in this apply
   * - contactId: set to the effective contact
   * If document linking fails (soft), linkedDocumentId is absent and documentLinkWarning is set.
   */
  document:
    | { linked: true; documentId: string }
    | { linked: false; warning: string };

  /**
   * 6. PORTAL (read-side)
   * After apply, the following portal queries must return the new data:
   * - getClientPortfolioForContact: contract visible (visibleToClient=true, portfolioStatus=active)
   * - getDocumentsForClient: document visible (visibleToClient=true)
   * - getPaymentInstructionsForContact: payment setup visible (status=active, needsHumanReview=false)
   *   — only when payment was written AND advisor confirmed prefill fields (if any)
   * No additional cache invalidation needed (portal reads are non-cached server actions).
   */
  portal: {
    contractVisibleInPortfolio: boolean;
    documentVisibleInDocs: boolean;
    paymentVisibleWhenEligible: boolean;
  };
};

/**
 * Validates that an apply result payload satisfies the write-through contract.
 * Returns a list of violations (empty = all good).
 * Used in integration tests and optionally in audit logging.
 *
 * Generic: validates structural completeness, not business values.
 *
 * @param options.isSupportingDocumentOnly — attach-only publish (supporting / internal outcome):
 *   contract row is intentionally absent; do not flag missing `createdContractId`.
 */
export type ValidateWriteThroughOptions = {
  isSupportingDocumentOnly?: boolean;
};

export function validateWriteThroughResult(
  payload: {
    createdClientId?: string;
    linkedClientId?: string;
    createdContractId?: string;
    linkedDocumentId?: string;
    documentLinkWarning?: string;
    createdPaymentSetupId?: string;
  },
  options?: ValidateWriteThroughOptions,
): string[] {
  const violations: string[] = [];
  const supportingOnly = options?.isSupportingDocumentOnly === true;

  const contactId = payload.createdClientId ?? payload.linkedClientId;
  if (!contactId) {
    violations.push("write_through: no contact created or linked after apply");
  }

  if (!supportingOnly && !payload.createdContractId) {
    violations.push("write_through: no contract row created/updated after apply");
  }

  if (!payload.linkedDocumentId && !payload.documentLinkWarning) {
    violations.push(
      "write_through: document linkage result unknown (neither linkedDocumentId nor documentLinkWarning set)"
    );
  }

  return violations;
}

// ── Publish outcome + post-apply bridge (canonical publish spine) ─────────────

export type ContractAnalysisBridgeSuggestion = {
  id: string;
  label: string;
  href: string;
  type: "analysis" | "service_action";
};

type PayloadWithBridge = ApplyResultPayload & {
  bridgeSuggestions?: ContractAnalysisBridgeSuggestion[];
};

/**
 * True when publish produced a real CRM contract row and/or payment setup.
 * Intentionally excludes `createdTaskId`: apply does not auto-create tasks, so task IDs
 * must not drive downstream CTAs or “success” affordances (no ghost artifacts).
 */
export function hasPublishArtifactsForBridge(payload: ApplyResultPayload | null | undefined): boolean {
  if (!payload) return false;
  return Boolean(payload.createdContractId || payload.createdPaymentSetupId);
}

/**
 * Phase 5A: Deterministicky spočítá publish outcome z výsledku apply.
 * Jeden zdroj pravdy — volán z applyContractReviewDrafts a čten v UI.
 * Neobsahuje žádnou vendor/PDF logiku.
 *
 * Truthful outcome enforcement:
 * - product_published_visible_to_client vyžaduje reálný createdContractId v DB
 * - payment_setup_published vyžaduje reálný createdPaymentSetupId v DB
 * - bez těchto artefaktů nelze vrátit zelený outcome
 */
export function computePublishOutcome(
  payload: ApplyResultPayload | null | undefined,
  isSupportingDocument: boolean,
): ApplyPublishOutcome {
  const hasContract = typeof payload?.createdContractId === "string" && payload.createdContractId.length > 0;
  const hasPaymentSetup =
    typeof payload?.createdPaymentSetupId === "string" && payload.createdPaymentSetupId.length > 0;
  const hasLinkedDoc = Boolean(payload?.linkedDocumentId);
  const hasDocWarning = Boolean(payload?.documentLinkWarning);
  const supportingGuard =
    isSupportingDocument || payload?.policyEnforcementTrace?.supportingDocumentGuard === true;

  const paymentOutcome: ApplyPublishOutcome["paymentOutcome"] = hasPaymentSetup
    ? "payment_setup_published"
    : "payment_setup_skipped";

  if (hasContract && hasDocWarning) {
    return {
      mode: "publish_partial_failure",
      paymentOutcome,
      visibleToClient: true,
      label: "Smlouva/produkt zapsán, propojení dokumentu selhalo (parciální výsledek).",
    };
  }

  if (supportingGuard && !hasContract) {
    return {
      mode: "supporting_doc_only",
      paymentOutcome: "payment_setup_skipped",
      visibleToClient: false,
      label: "Podkladový dokument pouze přiložen — smlouva/produkt nevznikl.",
    };
  }

  if (hasContract) {
    return {
      mode: "product_published_visible_to_client",
      paymentOutcome,
      visibleToClient: true,
      label: "Smlouva/produkt propsán do Aidvisory a zobrazen v klientském portálu.",
    };
  }

  if (hasLinkedDoc && !hasContract) {
    return {
      mode: "internal_document_only",
      paymentOutcome: "payment_setup_skipped",
      visibleToClient: false,
      label: "Dokument přiložen ke kontaktu — smlouva/produkt nevznikl.",
    };
  }

  return {
    mode: "supporting_doc_only",
    paymentOutcome: "payment_setup_skipped",
    visibleToClient: false,
    label: "Zapsáno bez vytvoření smlouvy/produktu.",
  };
}

export function mapContractReviewToBridgePayload(params: {
  review: ContractReviewRow;
  payload: ApplyResultPayload | null | undefined;
}): PayloadWithBridge {
  const base = params.payload ?? {};
  const suggestions: ContractAnalysisBridgeSuggestion[] = [];

  if (hasPublishArtifactsForBridge(base)) {
    suggestions.push({
      id: "open-analyses",
      label: "Otevřít finanční analýzy",
      href: "/portal/analyses",
      type: "analysis",
    });
    suggestions.push({
      id: "open-service-actions",
      label: "Založit servisní akci",
      href: "/portal/tasks?filter=service",
      type: "service_action",
    });
  }

  return {
    ...base,
    bridgeSuggestions: suggestions,
  };
}
