import {
  aiReviewCorrectionEvents,
  aiReviewEvalCases,
  aiReviewLearningPatterns,
  and,
  desc,
  eq,
  inArray,
  sql,
} from "db";
import { withServiceTenantContext } from "@/lib/db/service-db";
import type { ContractReviewRow } from "./review-queue-repository";
import type { NewAiReviewCorrectionEvent } from "db";
import { logAiReviewLearningEvent } from "./ai-review-learning-observability";

export type CorrectionType =
  | "missing_field_added"
  | "wrong_value_replaced"
  | "wrong_entity_mapping"
  | "wrong_premium_aggregation"
  | "wrong_document_classification"
  | "wrong_publish_decision"
  | "formatting_normalization"
  | "manual_override";

export type PatternType =
  | "extraction_hint"
  | "validation_rule"
  | "premium_aggregation_rule"
  | "participant_detection_rule"
  | "publish_decision_rule"
  | "classification_hint"
  | "field_alias";

export type LearningPatternDraft = {
  scope: "tenant" | "institution" | "product" | "document_type" | "global_safe";
  institutionName: string | null;
  productName: string | null;
  documentType: string | null;
  fieldPath: string | null;
  patternType: PatternType;
  ruleText: string;
  promptHint: string | null;
  validatorHintJson: Record<string, unknown> | null;
  supportCount: number;
  confidence: number;
  severity: "low" | "medium" | "high" | "critical";
  sourceCorrectionIds: string[];
};

export type CorrectionHints = {
  promptHints: string[];
  validatorHints: Record<string, unknown>[];
  patternIds: string[];
};

export function buildCorrectionHintsTrace(hints: CorrectionHints): {
  learningHintsUsed: boolean;
  learningPatternIds: string[];
  learningHintCount: number;
} {
  return {
    learningHintsUsed: hints.promptHints.length > 0,
    learningPatternIds: hints.patternIds,
    learningHintCount: hints.promptHints.length,
  };
}

const CRITICAL_FIELD_PATTERNS = [
  /^policyHolder(\.|$)|fullName$/i,
  /^participants(\[|\.)/i,
  /^insuredPersons(\[|\.)/i,
  /^contractNumber$/i,
  /^institutionName$/i,
  /^productName$/i,
  /^premium\.totalMonthlyPremium$/i,
  /^premium\.frequency$/i,
  /payment.*(variableSymbol|account)/i,
  /^publishHints\.|publish/i,
  /document(Type|Classification)|lifecycle/i,
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function pathParts(path: string): string[] {
  return path.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
}

export function getValueByPath(obj: unknown, path: string): unknown {
  let current: unknown = obj;
  for (const part of pathParts(path)) {
    if (!isRecord(current) && !Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function normalizeValue(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value.trim().replace(/\s+/g, " ").slice(0, 500);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value).slice(0, 500);
}

function normalizeScopeValue(value: unknown): string | null {
  const normalized = normalizeValue(value);
  return normalized && normalized !== "—" ? normalized : null;
}

function inferCorrectionType(fieldPath: string, originalValue: unknown, correctedValue: unknown): CorrectionType {
  const lower = fieldPath.toLowerCase();
  if (lower.includes("premium") || lower.includes("pojistn")) return "wrong_premium_aggregation";
  if (lower.includes("publish")) return "wrong_publish_decision";
  if (lower.includes("documenttype") || lower.includes("classification") || lower.includes("lifecyclestatus")) {
    return "wrong_document_classification";
  }
  if (lower.includes("participant") || lower.includes("insured")) return "wrong_entity_mapping";
  if ((originalValue == null || originalValue === "") && correctedValue != null && correctedValue !== "") {
    return "missing_field_added";
  }
  if (normalizeValue(originalValue)?.toLowerCase() === normalizeValue(correctedValue)?.toLowerCase()) {
    return "formatting_normalization";
  }
  return "wrong_value_replaced";
}

function extractMetadata(row: ContractReviewRow, payload: unknown) {
  const trace = row.extractionTrace ?? {};
  return {
    institutionName:
      normalizeScopeValue(getValueByPath(payload, "institutionName")) ??
      normalizeScopeValue(getValueByPath(payload, "extractedFields.institutionName.value")) ??
      null,
    productName:
      normalizeScopeValue(getValueByPath(payload, "productName")) ??
      normalizeScopeValue(getValueByPath(payload, "extractedFields.productName.value")) ??
      null,
    documentType:
      row.correctedDocumentType ??
      row.detectedDocumentType ??
      normalizeScopeValue(getValueByPath(payload, "primaryType")) ??
      normalizeScopeValue(getValueByPath(payload, "documentType")) ??
      null,
    lifecycleStatus:
      row.correctedLifecycleStatus ??
      row.lifecycleStatus ??
      normalizeScopeValue(getValueByPath(payload, "lifecycleStatus")) ??
      null,
    promptVersion: trace.promptVersion ?? null,
    schemaVersion: trace.schemaVersion ?? null,
    modelName: trace.aiReviewModel ?? null,
    pipelineVersion: trace.pipelineVersion ?? (trace.aiReviewPipeline ? String(trace.aiReviewPipeline) : null),
    extractionRunId: normalizeScopeValue(getValueByPath(trace, "extractionRunId")),
  };
}

export function isCriticalCorrectionField(fieldPath: string): boolean {
  return CRITICAL_FIELD_PATTERNS.some((pattern) => pattern.test(fieldPath));
}

export function buildCorrectionEventValues(params: {
  row: ContractReviewRow;
  correctedPayload: unknown;
  correctedFields: string[];
  correctedBy: string;
}): NewAiReviewCorrectionEvent[] {
  const originalPayload = params.row.extractedPayload;
  const metadata = extractMetadata(params.row, params.correctedPayload);
  return params.correctedFields.map((fieldPath) => {
    const originalValue = getValueByPath(originalPayload, fieldPath);
    const correctedValue = getValueByPath(params.correctedPayload, fieldPath);
    return {
      tenantId: params.row.tenantId,
      reviewId: params.row.id,
      documentHash: normalizeScopeValue(params.row.storagePath),
      extractionRunId: metadata.extractionRunId,
      institutionName: metadata.institutionName,
      productName: metadata.productName,
      documentType: metadata.documentType,
      lifecycleStatus: metadata.lifecycleStatus,
      fieldPath,
      fieldLabel: fieldPath,
      originalValueJson: originalValue === undefined ? null : originalValue,
      correctedValueJson: correctedValue === undefined ? null : correctedValue,
      normalizedOriginalValue: normalizeValue(originalValue),
      normalizedCorrectedValue: normalizeValue(correctedValue),
      correctionType: inferCorrectionType(fieldPath, originalValue, correctedValue),
      promptVersion: metadata.promptVersion,
      schemaVersion: metadata.schemaVersion,
      modelName: metadata.modelName,
      pipelineVersion: metadata.pipelineVersion,
      createdBy: params.correctedBy,
      piiLevel: "contains_customer_data" as const,
    };
  });
}

export async function recordAiReviewCorrectionEvents(params: {
  row: ContractReviewRow;
  correctedPayload: unknown;
  correctedFields: string[];
  correctedBy: string;
}): Promise<void> {
  if (!params.correctedFields.length) return;
  const values = buildCorrectionEventValues(params);
  await withServiceTenantContext({ tenantId: params.row.tenantId, userId: params.correctedBy }, async (tx) => {
    await tx.insert(aiReviewCorrectionEvents).values(values);
  });
}

export async function acceptAiReviewCorrectionEventsOnApproval(params: {
  tenantId: string;
  reviewId: string;
  acceptedAt?: Date;
}): Promise<string[]> {
  const acceptedAt = params.acceptedAt ?? new Date();
  return await withServiceTenantContext({ tenantId: params.tenantId }, async (tx) => {
    const rows = await tx
      .update(aiReviewCorrectionEvents)
      .set({ acceptedOnApproval: true, acceptedAt })
      .where(and(
        eq(aiReviewCorrectionEvents.tenantId, params.tenantId),
        eq(aiReviewCorrectionEvents.reviewId, params.reviewId),
        eq(aiReviewCorrectionEvents.acceptedOnApproval, false),
        eq(aiReviewCorrectionEvents.rejected, false),
      ))
      .returning({ id: aiReviewCorrectionEvents.id });
    return rows.map((row) => row.id);
  });
}

function patternKey(pattern: Pick<LearningPatternDraft, "scope" | "institutionName" | "productName" | "documentType" | "fieldPath" | "patternType">): string {
  return [
    pattern.scope,
    pattern.institutionName ?? "",
    pattern.productName ?? "",
    pattern.documentType ?? "",
    pattern.fieldPath ?? "",
    pattern.patternType,
  ].join("|");
}

function confidenceFromSupport(supportCount: number): number {
  if (supportCount >= 4) return 0.85;
  if (supportCount >= 2) return 0.70;
  return 0.55;
}

export function mineLearningPatternDrafts(events: Array<{
  id: string;
  institutionName: string | null;
  productName: string | null;
  documentType: string | null;
  fieldPath: string;
  correctionType: string;
}>): LearningPatternDraft[] {
  const grouped = new Map<string, Array<typeof events[number]>>();
  for (const event of events) {
    const patternKind = patternKindForCorrection(event);
    const groupKey = [
      event.institutionName ?? "",
      event.productName ?? "",
      event.documentType ?? "",
      patternKind,
      patternKind === "field_alias" ? event.fieldPath : "",
    ].join("|");
    grouped.set(groupKey, [...(grouped.get(groupKey) ?? []), event]);
  }

  const drafts = new Map<string, LearningPatternDraft>();
  const add = (draft: LearningPatternDraft) => drafts.set(patternKey(draft), draft);

  for (const bucket of grouped.values()) {
    if (bucket.length < 1) continue;
    const sample = bucket[0];
    const supportCount = bucket.length;
    const sourceCorrectionIds = bucket.map((event) => event.id);
    const patternType = patternKindForCorrection(sample);
    if (patternType === "field_alias" && supportCount < 2) continue;
    const severity = severityForPattern(patternType, sample.fieldPath);
    const scope = scopeForCorrection(sample);
    const base = {
      scope,
      institutionName: sample.institutionName,
      productName: sample.productName,
      documentType: sample.documentType,
      fieldPath: patternType === "field_alias" || patternType === "extraction_hint" ? sample.fieldPath : null,
      supportCount,
      confidence: confidenceFromSupport(supportCount),
      sourceCorrectionIds,
      severity,
    };

    if (patternType === "premium_aggregation_rule") {
      add({
        ...base,
        patternType,
        ruleText: "Accepted advisor corrections show that total monthly premium must be validated against numbered insured-person premium rows.",
        promptHint: "U tohoto produktu vždy projdi všechny očíslované bloky pojištěných osob. Řádky typu 'Celkové běžné měsíční pojistné pro N. pojištěného' jsou pojistné dané osoby. Celkové měsíční pojistné smlouvy je součet všech pojištěných, pokud dokument neobsahuje explicitní celkový součet celé smlouvy.",
        validatorHintJson: {
          rule: "sum_numbered_insured_premiums",
          premiumLabels: ["Celkové běžné měsíční pojistné pro"],
          requireAllNumberedInsuredBlocks: true,
        },
      });
    } else if (patternType === "participant_detection_rule") {
      add({
        ...base,
        patternType,
        ruleText: "Accepted advisor corrections show that additional insured participants are often present in numbered or child-insured sections.",
        promptHint: "U tohoto produktu hledej všechny bloky '1. pojištěný', '2. pojištěný', 'dítě', 'spolupojištěný'. Nevracej pouze pojistníka, pokud dokument deklaruje více pojištěných.",
        validatorHintJson: {
          rule: "require_numbered_participants",
          participantLabels: ["1. pojištěný", "2. pojištěný", "dítě", "spolupojištěný"],
        },
      });
    } else if (patternType === "publish_decision_rule") {
      add({
        ...base,
        patternType,
        ruleText: "Accepted advisor corrections show that publish eligibility is decided by advisor upload intent and approval, not by AI lifecycle wording alone.",
        promptHint: "AI klasifikace může upozornit na návrh/modelaci, ale nesmí sama blokovat propsání do CRM. Rozhoduje upload intent poradce a schválení review.",
        validatorHintJson: { rule: "publish_from_upload_intent_and_approval" },
      });
    } else if (patternType === "classification_hint") {
      add({
        ...base,
        patternType,
        ruleText: "Accepted advisor corrections changed document classification or lifecycle for this context.",
        promptHint: "Ověř typ dokumentu a lifecycle podle nadpisu, účelu dokumentu a upload intentu poradce. Samotné slovo 'návrh' nepoužívej jako důvod k blokaci propsání.",
        validatorHintJson: { rule: "classification_evidence_required", fields: ["documentClassification.primaryType", "documentClassification.lifecycleStatus"] },
      });
    } else if (patternType === "field_alias") {
      add({
        ...base,
        patternType,
        ruleText: `Accepted advisor corrections repeatedly touched field alias mapping for ${sample.fieldPath}.`,
        promptHint: `U pole ${sample.fieldPath} ověř alternativní popisky a terminologii v dokumentu; hodnotu opři jen o aktuální dokument.`,
        validatorHintJson: {
          rule: "field_alias_attention",
          fieldPath: sample.fieldPath,
          aliases: [sample.fieldPath.split(".").pop() ?? sample.fieldPath],
        },
      });
    } else {
      add({
        ...base,
        patternType,
        ruleText: `Accepted advisor corrections repeatedly touched ${sample.fieldPath}.`,
        promptHint: `Věnuj zvýšenou pozornost poli ${sample.fieldPath}; použij pouze důkaz v aktuálním dokumentu.`,
        validatorHintJson: { rule: "field_attention", fieldPath: sample.fieldPath },
      });
    }
  }

  return [...drafts.values()];
}

function patternKindForCorrection(event: { fieldPath: string; correctionType: string }): PatternType {
  const fieldPath = event.fieldPath;
  const lower = fieldPath.toLowerCase();
  if (
    event.correctionType === "wrong_premium_aggregation" &&
    (lower.includes("premium.totalmonthlypremium") || lower.includes("premium.perinsured"))
  ) {
    return "premium_aggregation_rule";
  }
  if (
    event.correctionType === "wrong_entity_mapping" ||
    /participants\[[1-9]\]|insuredpersons\[[1-9]\]|child_insured|second_insured|spolupojištěn|dítě/i.test(fieldPath)
  ) {
    return "participant_detection_rule";
  }
  if (event.correctionType === "wrong_publish_decision" || /^publish/i.test(fieldPath)) {
    return "publish_decision_rule";
  }
  if (
    event.correctionType === "wrong_document_classification" ||
    /documentclassification\.(primarytype|lifecyclestatus)|lifecyclestatus/i.test(fieldPath)
  ) {
    return "classification_hint";
  }
  if (
    event.correctionType === "formatting_normalization" ||
    event.correctionType === "wrong_value_replaced"
  ) {
    return "field_alias";
  }
  return "extraction_hint";
}

function severityForPattern(patternType: PatternType, fieldPath: string): LearningPatternDraft["severity"] {
  if (patternType === "publish_decision_rule") return "critical";
  if (isCriticalCorrectionField(fieldPath)) return "high";
  if (patternType === "premium_aggregation_rule" || patternType === "participant_detection_rule") return "high";
  return "medium";
}

function scopeForCorrection(event: { institutionName: string | null; productName: string | null }): LearningPatternDraft["scope"] {
  if (event.productName) return "product";
  if (event.institutionName) return "institution";
  return "tenant";
}

export async function buildAiReviewLearningPatterns(params: {
  tenantId: string;
  institutionName?: string | null;
  productName?: string | null;
  documentType?: string | null;
}): Promise<LearningPatternDraft[]> {
  const rows = await withServiceTenantContext({ tenantId: params.tenantId }, async (tx) => {
    return await tx
      .select({
        id: aiReviewCorrectionEvents.id,
        institutionName: aiReviewCorrectionEvents.institutionName,
        productName: aiReviewCorrectionEvents.productName,
        documentType: aiReviewCorrectionEvents.documentType,
        fieldPath: aiReviewCorrectionEvents.fieldPath,
        correctionType: aiReviewCorrectionEvents.correctionType,
      })
      .from(aiReviewCorrectionEvents)
      .where(and(
        eq(aiReviewCorrectionEvents.tenantId, params.tenantId),
        eq(aiReviewCorrectionEvents.acceptedOnApproval, true),
        eq(aiReviewCorrectionEvents.rejected, false),
      ));
  });

  const relevant = rows.filter((row) =>
    (!params.institutionName || row.institutionName === params.institutionName) &&
    (!params.productName || row.productName === params.productName) &&
    (!params.documentType || row.documentType === params.documentType)
  );
  const drafts = mineLearningPatternDrafts(relevant);
  if (!drafts.length) {
    logAiReviewLearningEvent("learning_patterns_rebuilt", {
      tenantId: params.tenantId,
      institutionName: params.institutionName ?? null,
      productName: params.productName ?? null,
      documentType: params.documentType ?? null,
      patternCount: 0,
      patternTypes: [],
    });
    return drafts;
  }

  await withServiceTenantContext({ tenantId: params.tenantId }, async (tx) => {
    const now = new Date();
    for (const draft of drafts) {
      const existing = await tx
        .select({ id: aiReviewLearningPatterns.id })
        .from(aiReviewLearningPatterns)
        .where(and(
          eq(aiReviewLearningPatterns.tenantId, params.tenantId),
          eq(aiReviewLearningPatterns.scope, draft.scope),
          draft.institutionName == null
            ? sql`${aiReviewLearningPatterns.institutionName} IS NULL`
            : eq(aiReviewLearningPatterns.institutionName, draft.institutionName),
          draft.productName == null
            ? sql`${aiReviewLearningPatterns.productName} IS NULL`
            : eq(aiReviewLearningPatterns.productName, draft.productName),
          draft.documentType == null
            ? sql`${aiReviewLearningPatterns.documentType} IS NULL`
            : eq(aiReviewLearningPatterns.documentType, draft.documentType),
          draft.fieldPath == null
            ? sql`${aiReviewLearningPatterns.fieldPath} IS NULL`
            : eq(aiReviewLearningPatterns.fieldPath, draft.fieldPath),
          eq(aiReviewLearningPatterns.patternType, draft.patternType),
        ))
        .limit(1);
      if (existing[0]) {
        await tx
          .update(aiReviewLearningPatterns)
          .set({
            ruleText: draft.ruleText,
            promptHint: draft.promptHint,
            validatorHintJson: draft.validatorHintJson,
            supportCount: draft.supportCount,
            confidence: String(draft.confidence),
            severity: draft.severity,
            sourceCorrectionIds: draft.sourceCorrectionIds,
            updatedAt: now,
            lastSeenAt: now,
          })
          .where(eq(aiReviewLearningPatterns.id, existing[0].id));
      } else {
        await tx.insert(aiReviewLearningPatterns).values({
          tenantId: params.tenantId,
          ...draft,
          confidence: String(draft.confidence),
          sourceCorrectionIds: draft.sourceCorrectionIds,
          createdAt: now,
          updatedAt: now,
          lastSeenAt: now,
        });
      }
    }
  });

  logAiReviewLearningEvent("learning_patterns_rebuilt", {
    tenantId: params.tenantId,
    institutionName: params.institutionName ?? null,
    productName: params.productName ?? null,
    documentType: params.documentType ?? null,
    patternCount: drafts.length,
    patternTypes: drafts.map((draft) => draft.patternType),
  });
  return drafts;
}

function hintIsSafe(hint: string): boolean {
  return hint.length <= 500 && !/[\w.+-]+@[\w.-]+\.[a-z]{2,}|(\+?\d[\d\s]{7,})|\b\d{6}\/?\d{3,4}\b/i.test(hint);
}

function hintSimilarityKey(hint: string): string {
  return hint
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((word) => word.length > 3)
    .slice(0, 12)
    .join(" ");
}

function confidenceAsNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export async function getCorrectionHints(params: {
  tenantId: string;
  institutionName?: string | null;
  productName?: string | null;
  documentType?: string | null;
  documentText?: string | null;
  maxHints?: number;
}): Promise<CorrectionHints> {
  const maxHints = params.maxHints ?? 8;
  const rows = await withServiceTenantContext({ tenantId: params.tenantId }, async (tx) => {
    return await tx
      .select({
        id: aiReviewLearningPatterns.id,
        scope: aiReviewLearningPatterns.scope,
        institutionName: aiReviewLearningPatterns.institutionName,
        productName: aiReviewLearningPatterns.productName,
        documentType: aiReviewLearningPatterns.documentType,
        promptHint: aiReviewLearningPatterns.promptHint,
        validatorHintJson: aiReviewLearningPatterns.validatorHintJson,
        confidence: aiReviewLearningPatterns.confidence,
        supportCount: aiReviewLearningPatterns.supportCount,
        updatedAt: aiReviewLearningPatterns.updatedAt,
      })
      .from(aiReviewLearningPatterns)
      .where(and(
        eq(aiReviewLearningPatterns.tenantId, params.tenantId),
        eq(aiReviewLearningPatterns.enabled, true),
      ))
      .orderBy(desc(aiReviewLearningPatterns.supportCount), desc(aiReviewLearningPatterns.updatedAt));
  });

  const rank = (row: typeof rows[number]): number | null => {
    if (confidenceAsNumber(row.confidence) < 0.5) return null;
    if (
      row.scope === "product" &&
      row.institutionName === params.institutionName &&
      row.productName === params.productName &&
      (!row.documentType || row.documentType === params.documentType)
    ) return 1;
    if (
      row.scope === "institution" &&
      row.institutionName === params.institutionName &&
      !row.productName
    ) return 2;
    if (
      row.scope === "document_type" &&
      row.documentType === params.documentType &&
      !row.institutionName &&
      !row.productName
    ) return 3;
    if (
      row.scope === "tenant" &&
      !row.institutionName &&
      !row.productName &&
      (!row.documentType || row.documentType === params.documentType)
    ) return 4;
    if (row.scope === "global_safe") return 5;
    return null;
  };

  const seen = new Set<string>();
  const relevant = rows
    .map((row) => ({ row, rank: rank(row) }))
    .filter((entry): entry is { row: typeof rows[number]; rank: number } => entry.rank != null)
    .sort((a, b) =>
      a.rank - b.rank ||
      (b.row.supportCount ?? 0) - (a.row.supportCount ?? 0) ||
      confidenceAsNumber(b.row.confidence) - confidenceAsNumber(a.row.confidence)
    )
    .filter(({ row }) => {
      if (!row.promptHint || !hintIsSafe(row.promptHint)) return false;
      const key = hintSimilarityKey(row.promptHint);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, maxHints)
    .map(({ row }) => row);

  const result = {
    promptHints: relevant.map((row) => row.promptHint).filter((hint): hint is string => Boolean(hint)),
    validatorHints: relevant.map((row) => row.validatorHintJson).filter((hint): hint is Record<string, unknown> => isRecord(hint)),
    patternIds: relevant.map((row) => row.id),
  };
  logAiReviewLearningEvent("learning_hints_loaded", {
    tenantId: params.tenantId,
    institutionName: params.institutionName ?? null,
    productName: params.productName ?? null,
    documentType: params.documentType ?? null,
    hintCount: result.promptHints.length,
    patternIds: result.patternIds,
  });
  return result;
}

export async function createEvalCaseDraftsForAcceptedCorrections(params: {
  tenantId: string;
  reviewId: string;
  correctionIds: string[];
  expectedOutput: unknown;
}): Promise<number> {
  if (!params.correctionIds.length) return 0;
  const rows = await withServiceTenantContext({ tenantId: params.tenantId }, async (tx) => {
    return await tx
      .select({
        id: aiReviewCorrectionEvents.id,
        reviewId: aiReviewCorrectionEvents.reviewId,
        documentHash: aiReviewCorrectionEvents.documentHash,
        institutionName: aiReviewCorrectionEvents.institutionName,
        productName: aiReviewCorrectionEvents.productName,
        documentType: aiReviewCorrectionEvents.documentType,
        fieldPath: aiReviewCorrectionEvents.fieldPath,
      })
      .from(aiReviewCorrectionEvents)
      .where(and(
        eq(aiReviewCorrectionEvents.tenantId, params.tenantId),
        inArray(aiReviewCorrectionEvents.id, params.correctionIds),
        eq(aiReviewCorrectionEvents.acceptedOnApproval, true),
      ));
  });
  const critical = rows.filter((row) => isCriticalCorrectionField(row.fieldPath));
  if (!critical.length) return 0;
  const first = critical[0];
  await withServiceTenantContext({ tenantId: params.tenantId }, async (tx) => {
    await tx.insert(aiReviewEvalCases).values({
      tenantId: params.tenantId,
      sourceReviewId: params.reviewId,
      sourceCorrectionIds: critical.map((row) => row.id),
      documentHash: first.documentHash,
      institutionName: first.institutionName,
      productName: first.productName,
      documentType: first.documentType,
      expectedOutputJson: params.expectedOutput,
      criticalFields: critical.map((row) => row.fieldPath),
      piiScrubbed: false,
      active: true,
    });
  });
  return 1;
}

export async function listAiReviewLearningDebug(params: { tenantId: string; limit?: number }) {
  const limit = params.limit ?? 50;
  return await withServiceTenantContext({ tenantId: params.tenantId }, async (tx) => {
    const [events, patterns, evalCases] = await Promise.all([
      tx.select().from(aiReviewCorrectionEvents).where(eq(aiReviewCorrectionEvents.tenantId, params.tenantId)).orderBy(desc(aiReviewCorrectionEvents.createdAt)).limit(limit),
      tx.select().from(aiReviewLearningPatterns).where(eq(aiReviewLearningPatterns.tenantId, params.tenantId)).orderBy(desc(aiReviewLearningPatterns.updatedAt)).limit(limit),
      tx.select().from(aiReviewEvalCases).where(eq(aiReviewEvalCases.tenantId, params.tenantId)).orderBy(desc(aiReviewEvalCases.createdAt)).limit(limit),
    ]);
    return { events, patterns, evalCases };
  });
}

export async function listActiveAiReviewEvalCases(params: { tenantId: string; limit?: number }) {
  return await withServiceTenantContext({ tenantId: params.tenantId }, async (tx) => {
    return await tx
      .select()
      .from(aiReviewEvalCases)
      .where(and(
        eq(aiReviewEvalCases.tenantId, params.tenantId),
        eq(aiReviewEvalCases.active, true),
      ))
      .orderBy(desc(aiReviewEvalCases.createdAt))
      .limit(params.limit ?? 500);
  });
}

export function scoreAiReviewEvalCase(params: {
  expectedOutput: unknown;
  actualOutput: unknown;
  criticalFields: string[];
}) {
  const scoreValue = (payload: unknown, fieldPath: string): unknown => {
    if (fieldPath.endsWith(".length")) {
      const value = getValueByPath(payload, fieldPath.slice(0, -".length".length));
      return Array.isArray(value) ? value.length : undefined;
    }
    return getValueByPath(payload, fieldPath);
  };
  const asNumber = (value: unknown): number => {
    if (typeof value === "number") return value;
    return Number.parseFloat(String(value ?? "").replace(/\s/g, "").replace(",", "."));
  };
  const criticalResults = params.criticalFields.map((fieldPath) => {
    const expected = scoreValue(params.expectedOutput, fieldPath);
    const actual = scoreValue(params.actualOutput, fieldPath);
    const expectedNumber = asNumber(expected);
    const actualNumber = asNumber(actual);
    const numeric = Number.isFinite(expectedNumber) && Number.isFinite(actualNumber);
    const match = numeric
      ? Math.abs(expectedNumber - actualNumber) <= 0.01
      : JSON.stringify(expected) === JSON.stringify(actual);
    return { fieldPath, match, numeric };
  });
  const criticalExact = criticalResults.filter((r) => r.match).length / Math.max(1, criticalResults.length);
  const numericResults = criticalResults.filter((r) => r.numeric);
  const numericPremium = numericResults.filter((r) => r.match).length / Math.max(1, numericResults.length || 1);
  const expectedParticipants = getValueByPath(params.expectedOutput, "participants") ?? getValueByPath(params.expectedOutput, "insuredPersons");
  const actualParticipants = getValueByPath(params.actualOutput, "participants") ?? getValueByPath(params.actualOutput, "insuredPersons");
  const participantCount = Array.isArray(expectedParticipants) && Array.isArray(actualParticipants)
    ? expectedParticipants.length === actualParticipants.length
    : true;
  const expectedPublish =
    getValueByPath(params.expectedOutput, "publishIntent.shouldPublishToCrm") ??
    getValueByPath(params.expectedOutput, "publishHints.contractPublishable");
  const actualPublish =
    getValueByPath(params.actualOutput, "publishIntent.shouldPublishToCrm") ??
    getValueByPath(params.actualOutput, "publishHints.contractPublishable");
  const publishDecision = expectedPublish == null || expectedPublish === actualPublish;
  const classificationPrimary = (
    getValueByPath(params.expectedOutput, "documentClassification.primaryType") == null ||
    getValueByPath(params.expectedOutput, "documentClassification.primaryType") === getValueByPath(params.actualOutput, "documentClassification.primaryType")
  );
  const classificationLifecycle = (
    getValueByPath(params.expectedOutput, "documentClassification.lifecycleStatus") == null ||
    getValueByPath(params.expectedOutput, "documentClassification.lifecycleStatus") === getValueByPath(params.actualOutput, "documentClassification.lifecycleStatus")
  );
  return {
    criticalExact,
    numericPremium,
    participantCount,
    premiumAggregation: criticalResults.find((r) => r.fieldPath === "premium.totalMonthlyPremium")?.match ?? true,
    publishDecision,
    classificationMatch: classificationPrimary && classificationLifecycle,
    schemaValid: isRecord(params.actualOutput),
    criticalResults,
  };
}

export function buildAiReviewLearningScorecard(results: Array<ReturnType<typeof scoreAiReviewEvalCase>>) {
  const avg = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  const scorecard = {
    cases: results.length,
    schemaValid: avg(results.map((result) => result.schemaValid ? 1 : 0)),
    criticalExactMatch: avg(results.map((result) => result.criticalExact)),
    numericToleranceMatch: avg(results.map((result) => result.numericPremium)),
    participantCountMatch: avg(results.map((result) => result.participantCount ? 1 : 0)),
    premiumAggregationMatch: avg(results.map((result) => result.premiumAggregation ? 1 : 0)),
    publishDecisionMatch: avg(results.map((result) => result.publishDecision ? 1 : 0)),
    classificationMatch: avg(results.map((result) => result.classificationMatch ? 1 : 0)),
  };
  const thresholds = {
    schemaValid: 1,
    publishDecisionMatch: 1,
    numericToleranceMatch: 0.99,
    criticalExactMatch: 0.98,
  };
  return {
    ...scorecard,
    thresholds,
    pass:
      scorecard.schemaValid >= thresholds.schemaValid &&
      scorecard.publishDecisionMatch >= thresholds.publishDecisionMatch &&
      scorecard.numericToleranceMatch >= thresholds.numericToleranceMatch &&
      scorecard.criticalExactMatch >= thresholds.criticalExactMatch,
  };
}

export async function buildFineTuneDatasetRows(params: {
  tenantId: string;
  requireConsent: boolean;
}) {
  if (!params.requireConsent) {
    throw new Error("AI Review fine-tune export requires explicit admin consent.");
  }
  const cases = await withServiceTenantContext({ tenantId: params.tenantId }, async (tx) => {
    return await tx
      .select()
      .from(aiReviewEvalCases)
      .where(and(
        eq(aiReviewEvalCases.tenantId, params.tenantId),
        eq(aiReviewEvalCases.active, true),
        eq(aiReviewEvalCases.piiScrubbed, true),
      ))
      .orderBy(desc(aiReviewEvalCases.createdAt));
  });
  return cases.map((row, index) => ({
    split: index % 5 === 0 ? "holdout" : "train",
    messages: [
      {
        role: "system",
        content: "Extract a DocumentReviewEnvelope for an internal advisor AI Review. Use only anonymized input and current-document evidence.",
      },
      {
        role: "user",
        content: JSON.stringify({
          anonymizedInputRef: row.anonymizedInputRef,
          institutionName: row.institutionName,
          productName: row.productName,
          documentType: row.documentType,
          criticalFields: row.criticalFields,
        }),
      },
      {
        role: "assistant",
        content: JSON.stringify(row.expectedOutputJson),
      },
    ],
  }));
}
