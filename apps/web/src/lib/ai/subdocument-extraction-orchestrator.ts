/**
 * Per-Subdocument Extraction Orchestrator
 *
 * Runs AFTER the primary extraction pipeline and canonical normalization.
 * Handles multi-section bundle documents by running targeted extraction passes
 * for specific section types (health questionnaire, AML/FATCA, modelation).
 *
 * Design:
 * - Additive only — never replaces primary extraction results, only enriches them.
 * - Health questionnaire: targeted LLM call (only when detected, confidence >= 0.4).
 * - AML/FATCA: heuristic detection only — no extra LLM call.
 * - Modelation lifecycle correction: heuristic patching based on primary subdoc type.
 * - Payment section: heuristic check + patch if missing from primary extraction.
 *
 * First iteration scope:
 * - Per-section LLM extraction for health questionnaires ✓
 * - Heuristic lifecycle patching for modelation ✓
 * - Heuristic publishHints correction for AML/mixed bundles ✓
 * - Merge layer into canonical envelope ✓
 * - Full page-level section text isolation: NOT YET (future iteration)
 */

import { createResponseStructured, createAiReviewResponseFromPrompt } from "@/lib/openai";
import { getAiReviewPromptId } from "./prompt-model-registry";
import { buildAiReviewExtractionPromptVariables } from "./ai-review-prompt-variables";
import { sliceSectionTextForType, describeSourceMode, buildPageTextMapFromMarkdown, type SectionTextWindow } from "./section-text-slicer";
import type { AdobeStructuredResult } from "@/lib/adobe/structured-data-parser";
import {
  inferFidelityFromContext,
  pickByFidelity,
  mergeInvestmentField,
  buildSectionFidelitySummary,
  type SectionFidelitySummary,
} from "./extraction-evidence-fidelity";
import type { DocumentReviewEnvelope } from "./document-review-types";
import type {
  PacketMeta,
  PacketSubdocumentCandidate,
  HealthQuestionnaireRecord,
  PublishHints,
} from "./document-packet-types";
import {
  buildHealthSectionExtractionPrompt,
  HEALTH_SECTION_EXTRACTION_SCHEMA,
  type HealthSectionExtractionOutput,
  buildInvestmentSectionExtractionPrompt,
  INVESTMENT_SECTION_EXTRACTION_SCHEMA,
  type InvestmentSectionExtractionOutput,
} from "./subdocument-section-prompts";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SubdocumentSectionOutcome =
  | { type: "health_questionnaire"; result: HealthSectionExtractionOutput; confidence: number; fidelity?: SectionFidelitySummary | null }
  | { type: "aml_fatca_heuristic"; detected: boolean; pepFlag: boolean | null; confidence: number }
  | { type: "modelation_lifecycle_patch"; previousLifecycle: string | null | undefined; patched: boolean }
  | { type: "payment_section_detected"; confidence: number }
  | { type: "investment_section"; result: InvestmentSectionExtractionOutput; confidence: number; fidelity?: SectionFidelitySummary | null }
  | { type: "skipped"; reason: string };

export type SubdocumentOrchestrationResult = {
  /** Whether orchestration actually ran (false = early-exit). */
  orchestrationRan: boolean;
  /** Per-section outcomes for tracing. */
  sectionOutcomes: SubdocumentSectionOutcome[];
  /** Number of canonical field mutations applied to the envelope. */
  mutationCount: number;
  /** Non-fatal warnings raised during orchestration. */
  warnings: string[];
  /** Section-level fidelity summaries, keyed by candidate type. */
  fidelitySummaries?: Record<string, SectionFidelitySummary>;
  /**
   * Source mode traceability: describes which isolation method was used for each section pass.
   * Keys are section type strings, values are human-readable descriptions.
   * E.g. { health_questionnaire: "exact page-level (pageTextMap)", investment_section: "section/heading slice" }
   */
  sourceModeTrace?: Record<string, string>;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function candidatesByType(
  candidates: PacketSubdocumentCandidate[],
  type: PacketSubdocumentCandidate["type"],
  minConfidence = 0.35,
): PacketSubdocumentCandidate[] {
  return candidates.filter((c) => c.type === type && c.confidence >= minConfidence);
}

function hasPublishableSection(candidates: PacketSubdocumentCandidate[]): boolean {
  return candidates.some(
    (c) =>
      c.publishable &&
      c.confidence >= 0.35 &&
      (c.type === "final_contract" || c.type === "contract_proposal"),
  );
}

function strengthenPublishHints(
  existing: PublishHints | null | undefined,
  patch: Partial<PublishHints>,
): PublishHints {
  const base: PublishHints = existing ?? {
    contractPublishable: true,
    reviewOnly: false,
    needsSplit: false,
    needsManualValidation: false,
    sensitiveAttachmentOnly: false,
    reasons: [],
  };
  return {
    contractPublishable: patch.contractPublishable === false ? false : base.contractPublishable,
    reviewOnly: patch.reviewOnly === true ? true : base.reviewOnly,
    needsSplit: patch.needsSplit === true ? true : base.needsSplit,
    needsManualValidation: patch.needsManualValidation === true ? true : base.needsManualValidation,
    sensitiveAttachmentOnly:
      patch.sensitiveAttachmentOnly === true ? true : base.sensitiveAttachmentOnly,
    reasons: [
      ...(base.reasons ?? []),
      ...(patch.reasons ?? []),
    ],
  };
}

// ─── Health questionnaire extraction pass ────────────────────────────────────

async function runHealthSectionExtractionPass(
  markdownText: string,
  candidates: PacketSubdocumentCandidate[],
  envelope: DocumentReviewEnvelope,
  warnings: string[],
  totalPages?: number | null,
  pageTextMap?: Record<number, string> | null,
  structuredResult?: AdobeStructuredResult | null,
): Promise<SubdocumentSectionOutcome> {
  const healthCandidates = candidatesByType(candidates, "health_questionnaire", 0.4);
  if (healthCandidates.length === 0) {
    return { type: "skipped", reason: "no_health_candidates_above_threshold" };
  }

  // Narrow to health section — prefer adobe_structured_pages, then exact_pages, then fallbacks
  const sectionWindow: SectionTextWindow = sliceSectionTextForType(
    markdownText,
    candidates,
    "health_questionnaire",
    totalPages,
    pageTextMap,
    structuredResult,
  );
  const extractionText = sectionWindow.text;

  const confidence = Math.max(...healthCandidates.map((c) => c.confidence));

  try {
    const promptId = getAiReviewPromptId("healthSectionExtraction");
    let output: HealthSectionExtractionOutput | null = null;

    if (promptId) {
      // Prompt Builder path — uses narrowed section text
      const variables = buildAiReviewExtractionPromptVariables({
        documentText: extractionText,
        classificationReasons: candidates.map((c) => `${c.type}:${c.label}`),
        adobeSignals: sectionWindow.narrowed ? `section_slice:${sectionWindow.method}` : "",
        filename: "bundle_document",
      });
      const pr = await createAiReviewResponseFromPrompt(
        {
          promptKey: "healthSectionExtraction",
          promptId,
          version: null,
          variables,
        },
        { store: false, routing: { category: "ai_review" } },
      );
      if (!pr.ok) throw new Error(pr.error);
      try {
        output = JSON.parse(pr.text) as HealthSectionExtractionOutput;
      } catch {
        output = null;
      }
    } else {
      // Fallback: hardcoded prompt + structured output — uses narrowed section text
      const prompt = buildHealthSectionExtractionPrompt(extractionText, candidates);
      const response = await createResponseStructured<HealthSectionExtractionOutput>(
        prompt,
        HEALTH_SECTION_EXTRACTION_SCHEMA,
        {
          routing: { category: "ai_review" },
          schemaName: "health_section_extraction",
        },
      );
      output = response.parsed as HealthSectionExtractionOutput | null;
    }

    if (!output) output = null;
    if (!output || !output.healthSectionPresent) {
      return {
        type: "health_questionnaire",
        result: { healthSectionPresent: false, questionnaireEntries: [] },
        confidence,
        fidelity: buildSectionFidelitySummary(sectionWindow, markdownText.length, 0, 0),
      };
    }

    // Merge into envelope.healthQuestionnaires — additive
    const mergedEntries: HealthQuestionnaireRecord[] = Array.isArray(envelope.healthQuestionnaires)
      ? [...envelope.healthQuestionnaires]
      : [];

    for (const entry of output.questionnaireEntries ?? []) {
      if (!entry.questionnairePresent) continue;
      // Avoid duplicate entries for the same participant
      const alreadyPresent = mergedEntries.some(
        (e) =>
          e.linkedParticipantName &&
          entry.participantName &&
          e.linkedParticipantName.trim().toLowerCase() === entry.participantName.trim().toLowerCase(),
      );
      if (!alreadyPresent) {
        mergedEntries.push({
          linkedParticipantName: entry.participantName ?? null,
          questionnairePresent: true,
          sectionSummary: entry.sectionSummary ?? null,
          medicallyRelevantFlags: entry.medicallyRelevantFlags ?? [],
          publishableAsSeparateDocument: false,
        });
      }
    }

    // If no entries from LLM but section is present, add a generic entry
    if (mergedEntries.length === 0 && output.healthSectionPresent) {
      mergedEntries.push({
        linkedParticipantName: null,
        questionnairePresent: true,
        sectionSummary: "Zdravotní dotazník detekován v bundlu.",
        medicallyRelevantFlags: [],
        publishableAsSeparateDocument: false,
      });
    }

    // Patch envelope
    envelope.healthQuestionnaires = mergedEntries.length > 0 ? mergedEntries : null;

    const fidelity = buildSectionFidelitySummary(
      sectionWindow,
      markdownText.length,
      mergedEntries.length,
      0,
    );

    if (sectionWindow.narrowed) {
      warnings.push(
        `health_section_narrowed:method=${sectionWindow.method},coverage=${Math.round(fidelity.coverageRatio * 100)}%`,
      );
    }

    return { type: "health_questionnaire", result: output, confidence, fidelity };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warnings.push(`health_section_extraction_failed: ${msg.slice(0, 100)}`);
    return { type: "skipped", reason: `health_extraction_error: ${msg.slice(0, 50)}` };
  }
}

// ─── AML / FATCA heuristic detection ─────────────────────────────────────────

function runAmlHeuristicDetection(
  candidates: PacketSubdocumentCandidate[],
  envelope: DocumentReviewEnvelope,
): SubdocumentSectionOutcome {
  const amlCandidates = candidatesByType(candidates, "aml_fatca_form", 0.35);
  if (amlCandidates.length === 0) {
    return { type: "skipped", reason: "no_aml_candidates" };
  }

  const confidence = Math.max(...amlCandidates.map((c) => c.confidence));
  const hasPublishable = hasPublishableSection(candidates);

  // Add warning if not already present
  if (!Array.isArray(envelope.reviewWarnings)) {
    envelope.reviewWarnings = [];
  }
  const alreadyWarned = envelope.reviewWarnings.some((w) => w.code === "aml_fatca_section_detected");
  if (!alreadyWarned) {
    envelope.reviewWarnings.push({
      code: "aml_fatca_section_detected",
      message:
        "Dokument obsahuje AML/FATCA formulář. Tato sekce nesmí být publikována jako smlouva.",
      severity: "warning",
    });
  }

  // Strengthen publishHints
  const onlyAml = !hasPublishable && amlCandidates.length > 0;
  envelope.publishHints = strengthenPublishHints(envelope.publishHints, {
    contractPublishable: onlyAml ? false : undefined,
    sensitiveAttachmentOnly: onlyAml,
    needsSplit: hasPublishable,
    needsManualValidation: true,
    reasons: onlyAml
      ? ["aml_fatca_section_only_no_publishable_contract"]
      : ["aml_fatca_section_present_bundle"],
  });

  return { type: "aml_fatca_heuristic", detected: true, pepFlag: null, confidence };
}

// ─── Modelation lifecycle correction ─────────────────────────────────────────

function runModelationLifecycleCorrection(
  packetMeta: PacketMeta,
  envelope: DocumentReviewEnvelope,
): SubdocumentSectionOutcome {
  const prevLifecycle = envelope.documentClassification?.lifecycleStatus;

  if (!packetMeta.primarySubdocumentType) {
    return { type: "skipped", reason: "no_primary_subdocument_type" };
  }

  const MODELATION_TYPES = new Set(["modelation", "contract_proposal"]);
  const isPrimaryModelation = MODELATION_TYPES.has(packetMeta.primarySubdocumentType);
  const FINAL_TYPES = new Set(["final_contract"]);
  const isPrimaryFinal = FINAL_TYPES.has(packetMeta.primarySubdocumentType);

  if (isPrimaryModelation) {
    // Correct lifecycle to modelation if LLM mis-classified
    if (
      prevLifecycle &&
      prevLifecycle !== "modelation" &&
      prevLifecycle !== "proposal" &&
      prevLifecycle !== "offer"
    ) {
      if (envelope.documentClassification) {
        envelope.documentClassification.lifecycleStatus = "modelation";
      }
      // Modelation is never publishable
      envelope.publishHints = strengthenPublishHints(envelope.publishHints, {
        contractPublishable: false,
        reviewOnly: true,
        reasons: ["primary_subdocument_is_modelation"],
      });
      return {
        type: "modelation_lifecycle_patch",
        previousLifecycle: prevLifecycle,
        patched: true,
      };
    }
    // Lifecycle already correct — just ensure publishHints are correct
    envelope.publishHints = strengthenPublishHints(envelope.publishHints, {
      contractPublishable: false,
      reviewOnly: true,
      reasons: ["primary_subdocument_is_modelation"],
    });
    return {
      type: "modelation_lifecycle_patch",
      previousLifecycle: prevLifecycle,
      patched: false,
    };
  }

  if (isPrimaryFinal) {
    // If LLM returned modelation lifecycle but packet says final_contract, correct it
    if (prevLifecycle === "modelation" || prevLifecycle === "proposal") {
      if (envelope.documentClassification) {
        envelope.documentClassification.lifecycleStatus = "final_contract";
      }
      return {
        type: "modelation_lifecycle_patch",
        previousLifecycle: prevLifecycle,
        patched: true,
      };
    }
  }

  return { type: "skipped", reason: "lifecycle_correction_not_needed" };
}

// ─── Payment section detection ────────────────────────────────────────────────

function runPaymentSectionDetection(
  candidates: PacketSubdocumentCandidate[],
  envelope: DocumentReviewEnvelope,
): SubdocumentSectionOutcome {
  const paymentCandidates = candidatesByType(candidates, "payment_instruction", 0.4);
  if (paymentCandidates.length === 0) {
    return { type: "skipped", reason: "no_payment_section_candidates" };
  }

  const confidence = Math.max(...paymentCandidates.map((c) => c.confidence));
  const hasPublishable = hasPublishableSection(candidates);

  if (!hasPublishable) {
    // Payment instruction only — mark accordingly
    envelope.publishHints = strengthenPublishHints(envelope.publishHints, {
      contractPublishable: false,
      reviewOnly: true,
      sensitiveAttachmentOnly: true,
      reasons: ["payment_instruction_only_no_contract"],
    });
  } else {
    // Mixed bundle: payment instructions + contract
    if (!Array.isArray(envelope.reviewWarnings)) envelope.reviewWarnings = [];
    const warned = envelope.reviewWarnings.some(
      (w) => w.code === "payment_instruction_in_bundle",
    );
    if (!warned) {
      envelope.reviewWarnings.push({
        code: "payment_instruction_in_bundle",
        message:
          "Bundle obsahuje platební instrukce jako samostatnou sekci. Ověřte před apply.",
        severity: "info",
      });
    }
    envelope.publishHints = strengthenPublishHints(envelope.publishHints, {
      needsManualValidation: true,
      reasons: ["payment_instruction_present_in_bundle"],
    });
  }

  return { type: "payment_section_detected", confidence };
}

// ─── Investment / DIP / DPS section extraction pass ──────────────────────────

/**
 * Merge investment section extraction results into the envelope.
 * Rules:
 * - investmentData: if not populated or only partially populated, enrich from section result
 * - paymentData: investmentPremium added if missing
 * - publishHints: only strengthened, never weakened
 * - DPS/PP/DIP: never published as life insurance contract
 */
async function runInvestmentSectionExtractionPass(
  markdownText: string,
  candidates: PacketSubdocumentCandidate[],
  envelope: DocumentReviewEnvelope,
  warnings: string[],
  totalPages?: number | null,
  pageTextMap?: Record<number, string> | null,
  structuredResult?: AdobeStructuredResult | null,
): Promise<SubdocumentSectionOutcome> {
  const invCandidates = candidatesByType(candidates, "investment_section", 0.35);
  if (invCandidates.length === 0) {
    return { type: "skipped", reason: "no_investment_section_candidates" };
  }

  const confidence = Math.max(...invCandidates.map((c) => c.confidence));

  // Narrow to investment section — prefer adobe_structured_pages, then exact_pages, then fallbacks
  const sectionWindow: SectionTextWindow = sliceSectionTextForType(
    markdownText,
    candidates,
    "investment_section",
    totalPages,
    pageTextMap,
    structuredResult,
  );
  const extractionText = sectionWindow.text;

  try {
    const promptId = getAiReviewPromptId("investmentSectionExtraction");
    let output: InvestmentSectionExtractionOutput | null = null;

    if (promptId) {
      // Prompt Builder path — uses narrowed section text
      const variables = buildAiReviewExtractionPromptVariables({
        documentText: extractionText,
        classificationReasons: candidates.map((c) => `${c.type}:${c.label}`),
        adobeSignals: sectionWindow.narrowed ? `section_slice:${sectionWindow.method}` : "",
        filename: "bundle_document",
      });
      const pr = await createAiReviewResponseFromPrompt(
        {
          promptKey: "investmentSectionExtraction",
          promptId,
          version: null,
          variables,
        },
        { store: false, routing: { category: "ai_review" } },
      );
      if (!pr.ok) throw new Error(pr.error);
      try {
        output = JSON.parse(pr.text) as InvestmentSectionExtractionOutput;
      } catch {
        output = null;
      }
    } else {
      // Fallback: hardcoded prompt + structured output — uses narrowed section text
      const prompt = buildInvestmentSectionExtractionPrompt(extractionText, candidates);
      const response = await createResponseStructured<InvestmentSectionExtractionOutput>(
        prompt,
        INVESTMENT_SECTION_EXTRACTION_SCHEMA,
        {
          routing: { category: "ai_review" },
          schemaName: "investment_section_extraction",
        },
      );
      output = response.parsed as InvestmentSectionExtractionOutput | null;
    }

    if (!output || !output.investmentSectionPresent) {
      return {
        type: "investment_section",
        result: { investmentSectionPresent: false, productType: "unknown" },
        confidence,
        fidelity: buildSectionFidelitySummary(sectionWindow, markdownText.length, 0, 0),
      };
    }

    // Merge investmentData — use evidence fidelity to decide which value wins.
    // Section-local (narrowed) extraction has explicit_section fidelity; full-doc has global_context_guess.
    const sectionFidelity = sectionWindow.narrowed ? "explicit_section" : "cross_section_inference";
    const globalFidelity = "global_context_guess";

    const existing = envelope.investmentData;
    if (!existing) {
      // No investmentData yet — populate fully from section extraction
      envelope.investmentData = {
        strategy: output.strategy ?? null,
        funds: (output.funds ?? []).map((f) => ({ name: f.name, allocation: f.allocation ?? null })),
        investmentAmount: output.investmentAmount ?? null,
        isModeledData: output.isModeledData ?? false,
        isContractualData: output.isContractualData ?? false,
        notes: buildInvestmentNotes(output),
      };
    } else {
      // Enrich using fidelity-aware merge: section-local (narrowed) wins over existing global extraction
      const updatedInvestmentData = { ...existing };

      updatedInvestmentData.strategy = pickByFidelity(
        existing.strategy,
        existing.isContractualData ? "explicit_subdocument" : globalFidelity,
        output.strategy,
        output.isContractualData ? sectionFidelity : "inferred_section",
      ) ?? existing.strategy ?? null;

      if (!existing.funds?.length && output.funds?.length) {
        updatedInvestmentData.funds = output.funds.map((f) => ({ name: f.name, allocation: f.allocation ?? null }));
      }

      updatedInvestmentData.investmentAmount = pickByFidelity(
        existing.investmentAmount ? String(existing.investmentAmount) : null,
        existing.isContractualData ? "explicit_subdocument" : globalFidelity,
        output.investmentAmount ? String(output.investmentAmount) : null,
        output.isContractualData ? sectionFidelity : "inferred_section",
      ) ? (output.investmentAmount ?? existing.investmentAmount) : existing.investmentAmount;

      // Upgrade contractual flag if section result is contractual
      if (output.isContractualData && !existing.isContractualData) {
        updatedInvestmentData.isContractualData = true;
        updatedInvestmentData.isModeledData = false;
      }

      envelope.investmentData = updatedInvestmentData;
    }

    // Enrich paymentData with investmentPremium if missing
    if (output.investmentPremium != null) {
      const pay = envelope.paymentData ?? {};
      if (!("investmentPremium" in pay)) {
        envelope.paymentData = {
          ...pay,
          notes: pay.notes
            ? `${pay.notes}; investiční prémie: ${output.investmentPremium}`
            : `Investiční prémie: ${output.investmentPremium}`,
        };
      }
    }

    // PublishHints: DPS/PP are publishable; DIP is publishable; investment_service_agreement may not be
    const NON_STANDALONE_TYPES = new Set(["investment_service_agreement"]);
    const hasPublishable = hasPublishableSection(candidates);
    if (NON_STANDALONE_TYPES.has(output.productType) && !hasPublishable) {
      envelope.publishHints = strengthenPublishHints(envelope.publishHints, {
        reviewOnly: true,
        needsManualValidation: true,
        reasons: ["investment_service_agreement_not_standalone"],
      });
    }

    // Add section hint to reviewWarnings if investment type differs from primary classification
    const primaryType = envelope.documentClassification?.primaryType;
    const isDipOrDps = output.productType === "DIP" || output.productType === "DPS";
    const isClassifiedAsLifeInsurance = primaryType?.startsWith("life_insurance") === true;
    if (isDipOrDps && isClassifiedAsLifeInsurance) {
      if (!Array.isArray(envelope.reviewWarnings)) envelope.reviewWarnings = [];
      const alreadyWarned = envelope.reviewWarnings.some(
        (w) => w.code === "investment_type_mismatch_dip_dps",
      );
      if (!alreadyWarned) {
        envelope.reviewWarnings.push({
          code: "investment_type_mismatch_dip_dps",
          message: `Dokument byl klasifikován jako životní pojištění, ale investiční sekce indikuje ${output.productType}. Ověřte správný typ produktu.`,
          severity: "warning",
        });
      }
    }

    const explicitCount = [output.strategy, output.investmentAmount].filter(Boolean).length +
      (output.funds?.length ?? 0);
    const fidelity = buildSectionFidelitySummary(sectionWindow, markdownText.length, explicitCount, 0);

    if (sectionWindow.narrowed) {
      warnings.push(
        `investment_section_narrowed:method=${sectionWindow.method},coverage=${Math.round(fidelity.coverageRatio * 100)}%`,
      );
    }

    return { type: "investment_section", result: output, confidence, fidelity };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warnings.push(`investment_section_extraction_failed: ${msg.slice(0, 100)}`);
    return { type: "skipped", reason: `investment_extraction_error: ${msg.slice(0, 50)}` };
  }
}

function buildInvestmentNotes(output: InvestmentSectionExtractionOutput): string | null {
  const parts: string[] = [];
  if (output.provider) parts.push(`Poskytovatel: ${output.provider}`);
  if (output.productName) parts.push(`Produkt: ${output.productName}`);
  if (output.notes) parts.push(output.notes);
  return parts.length > 0 ? parts.join("; ") : null;
}

// ─── Merge mutation count helper ─────────────────────────────────────────────

function countMutations(outcomes: SubdocumentSectionOutcome[]): number {
  return outcomes.filter((o) => o.type !== "skipped").length;
}

// ─── Main orchestrator ────────────────────────────────────────────────────────

/**
 * Orchestrate per-subdocument extraction for a bundle document.
 *
 * Call this AFTER `applyCanonicalNormalizationToEnvelope` with the full
 * markdown text, the computed packetMeta, and the primary envelope (mutated in-place).
 *
 * Only runs when:
 * - `packetMeta.isBundle === true`
 * - `markdownText` has meaningful content (>= 200 chars)
 * - At least one candidate is present
 *
 * The function mutates `envelope` in-place (additive only) and returns
 * a detailed outcome for tracing.
 */
export async function orchestrateSubdocumentExtraction(
  markdownText: string,
  packetMeta: PacketMeta,
  envelope: DocumentReviewEnvelope,
  /** Optional total page count from preprocess meta — improves page-range-based text narrowing. */
  totalPages?: number | null,
  /**
   * Optional physical page-level text map (key = 1-indexed page number).
   * When provided and has >1 page, enables exact_pages isolation for focused passes.
   * If not provided, will be built from markdownText + totalPages as best-effort.
   */
  pageTextMap?: Record<number, string> | null,
  /**
   * Optional Adobe Extract structuredData.json parsed result.
   * When provided and multi-page, enables adobe_structured_pages isolation (highest priority).
   */
  structuredResult?: AdobeStructuredResult | null,
): Promise<SubdocumentOrchestrationResult> {
  const warnings: string[] = [];

  // Early exit conditions
  if (!packetMeta.isBundle) {
    return { orchestrationRan: false, sectionOutcomes: [], mutationCount: 0, warnings };
  }
  const hasStructuredPages = (structuredResult?.totalPages ?? 0) > 1;
  if (markdownText.length < 200 && !hasStructuredPages) {
    return { orchestrationRan: false, sectionOutcomes: [], mutationCount: 0, warnings };
  }
  const candidates = packetMeta.subdocumentCandidates ?? [];
  if (candidates.length === 0) {
    return { orchestrationRan: false, sectionOutcomes: [], mutationCount: 0, warnings };
  }

  // Build pageTextMap from markdown if not provided — enables exact_pages for documents
  // that have page-break markers in the markdown content
  const resolvedPageTextMap: Record<number, string> | null =
    pageTextMap ??
    (markdownText
      ? buildPageTextMapFromMarkdown(markdownText, totalPages)
      : null);

  const hasPhysicalPages =
    resolvedPageTextMap !== null && Object.keys(resolvedPageTextMap).length > 1;
  if (hasPhysicalPages) {
    warnings.push(`page_text_map_available:${Object.keys(resolvedPageTextMap!).length}_pages`);
  }

  const hasAdobeStructured = structuredResult?.ok && (structuredResult.totalPages ?? 0) > 1;
  if (hasAdobeStructured) {
    warnings.push(`adobe_structured_available:${structuredResult!.totalPages}_pages`);
  }

  const outcomes: SubdocumentSectionOutcome[] = [];

  // 1. Modelation lifecycle correction (synchronous, cheap)
  const modelationOutcome = runModelationLifecycleCorrection(packetMeta, envelope);
  outcomes.push(modelationOutcome);

  // 2. AML/FATCA heuristic detection (synchronous, cheap)
  const amlOutcome = runAmlHeuristicDetection(candidates, envelope);
  outcomes.push(amlOutcome);

  // 3. Payment section detection (synchronous, cheap)
  const paymentOutcome = runPaymentSectionDetection(candidates, envelope);
  outcomes.push(paymentOutcome);

  // 4. Health questionnaire targeted extraction (async LLM call — prefers adobe_structured_pages)
  const healthOutcome = await runHealthSectionExtractionPass(
    markdownText,
    candidates,
    envelope,
    warnings,
    totalPages,
    resolvedPageTextMap,
    structuredResult,
  );
  outcomes.push(healthOutcome);

  // 5. Investment / DIP / DPS targeted extraction (async LLM call — prefers adobe_structured_pages)
  const investmentOutcome = await runInvestmentSectionExtractionPass(
    markdownText,
    candidates,
    envelope,
    warnings,
    totalPages,
    resolvedPageTextMap,
    structuredResult,
  );
  outcomes.push(investmentOutcome);

  // 6. Ensure envelope.packetMeta is up-to-date (may have been partially applied earlier)
  envelope.packetMeta = packetMeta;

  // Aggregate fidelity summaries and source mode trace for E2E validation
  const fidelitySummaries: Record<string, SectionFidelitySummary> = {};
  const sourceModeTrace: Record<string, string> = {};

  for (const o of outcomes) {
    if (o.type === "health_questionnaire" || o.type === "investment_section") {
      if (o.fidelity) {
        fidelitySummaries[o.type] = o.fidelity;
        sourceModeTrace[o.type] = describeSourceMode({
          method: o.fidelity.sliceMethod,
          text: "",
          startOffset: 0,
          endOffset: 0,
          narrowed: o.fidelity.textNarrowed,
        });
      }
    }
  }

  return {
    orchestrationRan: true,
    sectionOutcomes: outcomes,
    mutationCount: countMutations(outcomes),
    warnings,
    fidelitySummaries: Object.keys(fidelitySummaries).length > 0 ? fidelitySummaries : undefined,
    sourceModeTrace: Object.keys(sourceModeTrace).length > 0 ? sourceModeTrace : undefined,
  };
}

/**
 * Derive extraction route label from primary subdocument type.
 * Used for trace logging.
 */
export function describeSubdocumentExtractionRoute(packetMeta: PacketMeta): string {
  if (!packetMeta.isBundle) return "single_document";
  const primary = packetMeta.primarySubdocumentType;
  const sections = packetMeta.subdocumentCandidates.map((c) => c.type).join("+");
  return `bundle[${primary ?? "unknown"}]:${sections}`;
}
