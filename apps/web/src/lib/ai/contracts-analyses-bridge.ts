import type { ApplyResultPayload, ApplyPublishOutcome, ContractReviewRow } from "@/lib/ai/review-queue-repository";

export type ContractAnalysisBridgeSuggestion = {
  id: string;
  label: string;
  href: string;
  type: "analysis" | "service_action";
};

type PayloadWithBridge = ApplyResultPayload & {
  bridgeSuggestions?: ContractAnalysisBridgeSuggestion[];
};

function hasAnyContractArtifacts(payload: ApplyResultPayload | null | undefined) {
  if (!payload) return false;
  return Boolean(payload.createdContractId || payload.createdPaymentSetupId || payload.createdTaskId);
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
  // GUARD: createdContractId musí být skutečné DB ID — ne jen truthy string
  const hasContract = typeof payload?.createdContractId === "string" && payload.createdContractId.length > 0;
  // GUARD: createdPaymentSetupId musí být skutečné DB ID
  const hasPaymentSetup = typeof payload?.createdPaymentSetupId === "string" && payload.createdPaymentSetupId.length > 0;
  const hasLinkedDoc = Boolean(payload?.linkedDocumentId);
  const hasDocWarning = Boolean(payload?.documentLinkWarning);
  const supportingGuard = isSupportingDocument ||
    (payload?.policyEnforcementTrace?.supportingDocumentGuard === true);

  // TRUTHFUL: payment_setup_published jen pokud skutečný artefakt vznikl
  const paymentOutcome: ApplyPublishOutcome["paymentOutcome"] = hasPaymentSetup
    ? "payment_setup_published"
    : "payment_setup_skipped";

  // Partial failure: apply ran but some post-commit downstream step failed
  if (hasContract && hasDocWarning) {
    return {
      mode: "publish_partial_failure",
      paymentOutcome,
      visibleToClient: true,
      label: "Smlouva/produkt zapsán, propojení dokumentu selhalo (parciální výsledek).",
    };
  }

  // Supporting document — only attached, never a published contract
  if (supportingGuard && !hasContract) {
    return {
      mode: "supporting_doc_only",
      paymentOutcome: "payment_setup_skipped",
      visibleToClient: false,
      label: "Podkladový dokument pouze přiložen — smlouva/produkt nevznikl.",
    };
  }

  // TRUTHFUL: product_published_visible_to_client jen pokud contract v DB opravdu vznikl
  if (hasContract) {
    return {
      mode: "product_published_visible_to_client",
      paymentOutcome,
      visibleToClient: true,
      label: "Smlouva/produkt propsán do Aidvisory a zobrazen v klientském portálu.",
    };
  }

  // Document linked but no contract (internal document attach, e.g. advisor-only upload)
  if (hasLinkedDoc && !hasContract) {
    return {
      mode: "internal_document_only",
      paymentOutcome: "payment_setup_skipped",
      visibleToClient: false,
      label: "Dokument přiložen ke kontaktu — smlouva/produkt nevznikl.",
    };
  }

  // Fallback: payment only or task only — no contract artifact
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

  if (hasAnyContractArtifacts(base)) {
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

  if ((params.review.reasonsForReview ?? []).length > 0) {
    suggestions.push({
      id: "review-warnings",
      label: "Zkontrolovat AI varování v detailu",
      href: `/portal/contracts/review/${params.review.id}`,
      type: "analysis",
    });
  }

  return {
    ...base,
    bridgeSuggestions: suggestions,
  };
}
